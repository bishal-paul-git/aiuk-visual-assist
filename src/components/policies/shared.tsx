import { Chip, type Tone } from "@/components/ui/primitives";
import type { PolicyRule, PolicyStatus } from "@/lib/types/policies";

const tone: Record<PolicyStatus, Tone> = { active: "ok", draft: "neutral", review: "warn" };
const label: Record<PolicyStatus, string> = { active: "Active", draft: "Draft", review: "In review" };
export const PolicyStatusChip = ({ status }: { status: PolicyStatus }) => <Chip tone={tone[status]} dot>{label[status]}</Chip>;

export const effectMeta: Record<PolicyRule["effect"], { label: string; tone: Tone }> = {
  allow: { label: "Allow", tone: "ok" }, restrict: { label: "Restrict", tone: "warn" }, block: { label: "Block", tone: "bad" }, escalate: { label: "Escalate", tone: "human" }, log: { label: "Log", tone: "info" },
};
