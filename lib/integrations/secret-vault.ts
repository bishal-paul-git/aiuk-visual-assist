import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { authSecret } from "@/lib/server/auth-secret";

/**
 * Connector secrets entered on Platform → Integrations. Server only.
 *
 * Values are encrypted with AES-256-GCM under a key derived from AUTH_SECRET
 * and saved with the configuration (config.json or the Postgres config row),
 * so no one has to paste them into the hosting provider. An environment
 * variable with the same name (INTEGRATION_SECRET_<TENANT>) still wins.
 * Values are never returned to a browser, logged or audited; pages only show
 * whether one is set.
 *
 * Changing AUTH_SECRET makes stored values unreadable: they then count as
 * missing and must be entered again.
 */

const PREFIX = "v1:";

function key(): Buffer {
  return createHash("sha256").update(`visual-assist/connector-secrets/${authSecret()}`).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decryptSecret(sealed: string): string | undefined {
  if (!sealed.startsWith(PREFIX)) return undefined;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

export class SecretVault {
  private sealed = new Map<string, string>();
  /** Called after a change (persistence hook, set by the config store). */
  onChange?: () => void;

  load(entries: unknown) {
    this.sealed.clear();
    if (entries && typeof entries === "object" && !Array.isArray(entries)) {
      for (const [ref, v] of Object.entries(entries as Record<string, unknown>)) if (typeof v === "string") this.sealed.set(ref, v);
    }
  }

  /** Sealed values for writing back to the config store. */
  entries(): Record<string, string> {
    return Object.fromEntries(this.sealed);
  }

  set(ref: string, value: string) {
    this.sealed.set(ref, encryptSecret(value));
    this.onChange?.();
  }

  delete(ref: string) {
    if (this.sealed.delete(ref)) this.onChange?.();
  }

  has(ref: string): boolean {
    return this.get(ref) !== undefined;
  }

  get(ref: string): string | undefined {
    const s = this.sealed.get(ref);
    return s === undefined ? undefined : decryptSecret(s);
  }
}

const GLOBAL_KEY = "__aiukVisualAssistSecretVault";

export function getSecretVault(): SecretVault {
  const g = globalThis as unknown as Record<string, SecretVault | undefined>;
  return (g[GLOBAL_KEY] ??= new SecretVault());
}

/** Where a connector secret comes from: the environment first, then the vault. */
export function lookupSecret(ref: string, env: Record<string, string | undefined> = process.env, vault: SecretVault = getSecretVault()): { value?: string; source?: "env" | "stored" } {
  const fromEnv = env[ref];
  if (fromEnv) return { value: fromEnv, source: "env" };
  const stored = vault.get(ref);
  return stored ? { value: stored, source: "stored" } : {};
}
