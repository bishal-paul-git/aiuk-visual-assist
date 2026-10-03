export type CostCategoryId = "video" | "voice" | "model" | "compute" | "orchestration" | "storage" | "human";
export interface CostCategory { id: CostCategoryId; label: string; provider: string; perSession: number; share: number }
