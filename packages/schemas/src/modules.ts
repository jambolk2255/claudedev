export type ModuleKey =
  | "inventory"
  | "purchasing"
  | "sales"
  | "orders"
  | "finance"
  | "maps"
  | "reports"
  | "barcodes"
  | "approvals"
  | "batches"
  | "serials"
  | "multiWarehouse"
  | "pos";

export type ExperienceMode = "simple" | "advanced";

export interface ModuleDefinition {
  key: ModuleKey;
  /** Shown in the onboarding wizard and settings. Translation key lives in web messages. */
  advancedOnly: boolean;
  /** Core modules cannot be switched off. */
  core: boolean;
  defaultOn: boolean;
}

export const MODULES: ModuleDefinition[] = [
  { key: "inventory", core: true, advancedOnly: false, defaultOn: true },
  { key: "purchasing", core: false, advancedOnly: false, defaultOn: true },
  { key: "sales", core: false, advancedOnly: false, defaultOn: true },
  { key: "orders", core: false, advancedOnly: false, defaultOn: true },
  { key: "finance", core: false, advancedOnly: false, defaultOn: true },
  { key: "reports", core: false, advancedOnly: false, defaultOn: true },
  { key: "maps", core: false, advancedOnly: false, defaultOn: false },
  { key: "barcodes", core: false, advancedOnly: false, defaultOn: false },
  { key: "pos", core: false, advancedOnly: false, defaultOn: false },
  { key: "multiWarehouse", core: false, advancedOnly: true, defaultOn: false },
  { key: "batches", core: false, advancedOnly: true, defaultOn: false },
  { key: "serials", core: false, advancedOnly: true, defaultOn: false },
  { key: "approvals", core: false, advancedOnly: true, defaultOn: false },
];

export const MODULE_KEYS = MODULES.map((m) => m.key) as [ModuleKey, ...ModuleKey[]];

export function defaultModules(mode: ExperienceMode): ModuleKey[] {
  return MODULES.filter((m) => m.core || (m.defaultOn && (mode === "advanced" || !m.advancedOnly))).map((m) => m.key);
}

/** Drops advanced-only modules in simple mode and always keeps core modules. */
export function normalizeModules(mode: ExperienceMode, modules: ModuleKey[]): ModuleKey[] {
  const set = new Set(modules);
  return MODULES.filter((m) => m.core || (set.has(m.key) && (mode === "advanced" || !m.advancedOnly))).map((m) => m.key);
}
