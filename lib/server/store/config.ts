import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { policies, workflows } from "@/lib/config/catalog";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { getPolicyRegistry } from "@/lib/policy/registry";
import type { AuditEvent, Policy, WorkflowDefinition } from "@/lib/domain/types";
import { getConnectorRegistry } from "@/lib/integrations/config";

/**
 * Durable configuration for the file store: every workflow and policy version
 * (drafts, published, retired) plus their config audit trail, in
 * <DATA_DIR>/config.json. Loaded before sessions so a session pinned to a
 * version published at runtime can be restored after a restart.
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
}

export function attachConfigStore(dir: string): { restored: boolean } {
  const file = path.join(path.resolve(dir), "config.json");
  const wfReg = getWorkflowRegistry();
  const polReg = getPolicyRegistry();
  const connReg = getConnectorRegistry();
  let restored = false;

  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as ConfigFile;
    if (saved.version === FORMAT_VERSION && Array.isArray(saved.workflows) && Array.isArray(saved.policies)) {
      // Replace in place: every reader holds a reference to these arrays.
      workflows.splice(0, workflows.length, ...saved.workflows);
      policies.splice(0, policies.length, ...saved.policies);
      wfReg.audit.splice(0, wfReg.audit.length, ...(saved.workflowAudit ?? []));
      polReg.audit.splice(0, polReg.audit.length, ...(saved.policyAudit ?? []));
      if (saved.connectors) connReg.setStored(saved.connectors);
      restored = true;
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error(JSON.stringify({ level: "error", msg: "config.load_failed", error: String(e) }));
  }

  const save = () => {
    const body: ConfigFile = {
      version: FORMAT_VERSION,
      savedAt: new Date().toISOString(),
      workflows,
      policies,
      workflowAudit: wfReg.audit,
      policyAudit: polReg.audit,
      connectors: connReg.storedEntries(),
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(body));
    fs.renameSync(tmp, file);
  };
  wfReg.onChange = save;
  polReg.onChange = save;
  connReg.onChange = save;
  return { restored };
}
