import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { BUILT_IN_WORKFLOWS, policies, workflows } from "@/lib/config/catalog";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { getPolicyRegistry } from "@/lib/policy/registry";
import type { AuditEvent, Policy, WorkflowDefinition } from "@/lib/domain/types";
import { getConnectorRegistry } from "@/lib/integrations/config";
import { getSecretVault } from "@/lib/integrations/secret-vault";
import { log } from "@/lib/server/log";
import type { PgDatabase } from "./pg/db";
import { LatestWriter } from "./pg/writer";

/**
 * Durable configuration: every workflow and policy version (drafts,
 * published, retired) plus their config audit trail, and the integration
 * connectors. Saved to <DATA_DIR>/config.json (file store) or the single row
 * of visual_assist.config (Postgres store). Loaded before sessions so a
 * session pinned to a version published at runtime can be restored after a
 * restart.
 */

const FORMAT_VERSION = 1;

interface ConfigFile {
  version: number;
  savedAt: string;
  workflows: WorkflowDefinition[];
  policies: Policy[];
  workflowAudit: AuditEvent[];
  policyAudit: AuditEvent[];
  /** Integration connectors (no secrets: only secretRef names). INTEGRATIONS_CONFIG overrides per tenant/tool. */
  connectors?: unknown[];
  /** Connector secrets entered on Platform → Integrations, AES-256-GCM sealed (lib/integrations/secret-vault.ts). */
  secrets?: Record<string, string>;
}

/** Put saved configuration into the registries. Returns false when the body is not a usable config. */
function applyConfig(saved: ConfigFile | undefined): boolean {
  if (!saved || saved.version !== FORMAT_VERSION || !Array.isArray(saved.workflows) || !Array.isArray(saved.policies)) return false;
  const wfReg = getWorkflowRegistry();
  const polReg = getPolicyRegistry();
  // Replace in place: every reader holds a reference to these arrays.
  workflows.splice(0, workflows.length, ...refreshBuiltIns(saved.workflows, saved.workflowAudit ?? [], [...BUILT_IN_WORKFLOWS]));
  policies.splice(0, policies.length, ...saved.policies);
  wfReg.audit.splice(0, wfReg.audit.length, ...(saved.workflowAudit ?? []));
  polReg.audit.splice(0, polReg.audit.length, ...(saved.policyAudit ?? []));
  if (saved.connectors) getConnectorRegistry().setStored(saved.connectors);
  if (saved.secrets) getSecretVault().load(saved.secrets);
  return true;
}

/**
 * A built-in workflow (shipped in the code) that nobody has changed on the
 * platform is taken from the code, not from the saved copy, so improvements
 * to its steps, reading guides, approved answers and training notes reach the
 * live server on the next deploy. Anything created or changed on the platform
 * (it has config audit events) is kept exactly as saved. Built-ins missing
 * from the saved config are added.
 */
export function refreshBuiltIns(saved: WorkflowDefinition[], audit: AuditEvent[], builtIns: WorkflowDefinition[]): WorkflowDefinition[] {
  const touched = new Set(audit.map((a) => (a.payload as { workflowId?: string } | undefined)?.workflowId).filter(Boolean));
  const fromCode = new Map(builtIns.map((w) => [w.id, w]));
  const out = saved.map((w) => {
    const code = fromCode.get(w.id);
    if (!code || touched.has(w.id)) return w;
    return structuredClone(code);
  });
  const ids = new Set(out.map((w) => w.id));
  for (const w of builtIns) if (!ids.has(w.id)) out.push(structuredClone(w));
  const refreshed = saved.filter((w) => fromCode.has(w.id) && !touched.has(w.id)).map((w) => w.id);
  if (refreshed.length) log.info("config.builtin_workflows_refreshed", { workflows: refreshed });
  return out;
}

function currentConfig(): ConfigFile {
  return {
    version: FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    workflows,
    policies,
    workflowAudit: getWorkflowRegistry().audit,
    policyAudit: getPolicyRegistry().audit,
    connectors: getConnectorRegistry().storedEntries(),
    secrets: getSecretVault().entries(),
  };
}

function onAnyChange(save: () => void) {
  getWorkflowRegistry().onChange = save;
  getPolicyRegistry().onChange = save;
  getConnectorRegistry().onChange = save;
  getSecretVault().onChange = save;
}

export function attachConfigStore(dir: string): { restored: boolean } {
  const file = path.join(path.resolve(dir), "config.json");
  let restored = false;

  try {
    restored = applyConfig(JSON.parse(fs.readFileSync(file, "utf8")) as ConfigFile);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error(JSON.stringify({ level: "error", msg: "config.load_failed", error: String(e) }));
  }

  onAnyChange(() => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(currentConfig()));
    fs.renameSync(tmp, file);
  });
  return { restored };
}

/**
 * Postgres variant (DATABASE_URL): loads the row, then saves on every change.
 * The schema must exist (the session store migrates first). Writes run in the
 * background, the newest wins, and they are tracked so shutdown waits for them.
 */
export async function attachPostgresConfigStore(db: PgDatabase): Promise<{ restored: boolean }> {
  const { rows } = await db.query<{ body: ConfigFile | string }>("select body from visual_assist.config where id = 1");
  const body = rows[0]?.body;
  const restored = applyConfig(typeof body === "string" ? (JSON.parse(body) as ConfigFile) : body);
  const writer = new LatestWriter(
    (json) =>
      db.query(
        "insert into visual_assist.config (id, body, updated_at) values (1, $1::jsonb, now()) on conflict (id) do update set body = excluded.body, updated_at = now()",
        [json],
      ),
    (err) => log.error("config.save_failed", { store: "postgres", error: (err as Error).message }),
  );
  onAnyChange(() => void db.track(writer.push(() => JSON.stringify(currentConfig()))));
  return { restored };
}
