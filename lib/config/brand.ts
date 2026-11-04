import { agents, tenants } from "@/lib/config/catalog";
import type { BrandConfig } from "@/lib/domain/types";

/**
 * Client branding set on the platform (Platform → Clients → a client):
 * the name customers see, the colour, the support line and the assistant's
 * name. Applied in place to the catalog, so customer screens, the AI's
 * greeting ("Hi, I'm the {brand} visual assistant") and new sessions use it
 * at once. Persisted with the configuration (lib/server/store/config.ts).
 */

export interface BrandSettings extends BrandConfig {
  /** Name the AI speaks as, e.g. "X Telecom Assistant". Default: "<displayName> Assistant". */
  assistantName?: string;
}

const g = globalThis as unknown as { __aiukBrandChange?: () => void; __aiukBrands?: Record<string, BrandSettings> };

export function storedBrands(): Record<string, BrandSettings> {
  return (g.__aiukBrands ??= {});
}

export function setBrandListener(fn: () => void) {
  g.__aiukBrandChange = fn;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Checks and normalises a brand from user input. Returns an error message or the brand. */
export function validateBrand(input: Record<string, unknown>): BrandSettings | string {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (displayName.length < 2 || displayName.length > 40) return "The name customers see must be 2 to 40 characters.";
  const primaryColor = typeof input.primaryColor === "string" ? input.primaryColor.trim() : "";
  if (!COLOR.test(primaryColor)) return "The colour must look like #1D5BD8.";
  const supportLine = typeof input.supportLine === "string" && input.supportLine.trim() ? input.supportLine.trim().slice(0, 30) : undefined;
  if (supportLine && !/^[+0-9 ()-]{6,30}$/.test(supportLine)) return "The support line may only contain digits, spaces, + ( ) and -.";
  const assistantName = typeof input.assistantName === "string" && input.assistantName.trim() ? input.assistantName.trim().slice(0, 50) : undefined;
  return { displayName, primaryColor, ...(supportLine ? { supportLine } : {}), ...(assistantName ? { assistantName } : {}) };
}

/** Apply one client's brand to the catalog (tenant brand and its AI agents' names). */
export function applyBrand(tenantId: string, brand: BrandSettings) {
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) return;
  tenant.brand = { ...tenant.brand, displayName: brand.displayName, primaryColor: brand.primaryColor, supportLine: brand.supportLine };
  for (const a of agents) if (a.tenantId === tenantId) a.name = brand.assistantName ?? `${brand.displayName} Assistant`;
}

/** Load saved brands at boot. */
export function loadBrands(saved: Record<string, BrandSettings> | undefined) {
  const store = storedBrands();
  for (const [tenantId, brand] of Object.entries(saved ?? {})) {
    store[tenantId] = brand;
    applyBrand(tenantId, brand);
  }
}

/** Change a client's brand from the platform; saved with the configuration. */
export function setBrand(tenantId: string, brand: BrandSettings) {
  storedBrands()[tenantId] = brand;
  applyBrand(tenantId, brand);
  g.__aiukBrandChange?.();
}

/** Fills {brand} in approved wording with the client's current display name. */
export function withBrand(text: string, tenantId: string): string {
  if (!text.includes("{brand}")) return text;
  return text.replaceAll("{brand}", tenants.find((t) => t.id === tenantId)?.brand.displayName ?? "our");
}
