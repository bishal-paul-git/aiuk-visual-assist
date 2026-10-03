import { Chip, type Tone } from "@/components/ui/primitives";
import type { AiAgent } from "@/lib/data/agents";
import { clientById } from "@/lib/data/clients";
import { InitialsBlock } from "@/components/clients/shared";

const tone: Record<AiAgent["status"], Tone> = { active: "ok", draft: "neutral", paused: "warn" };
export const AgentStatusChip = ({ status }: { status: AiAgent["status"] }) => <Chip tone={tone[status]} dot>{status[0].toUpperCase() + status.slice(1)}</Chip>;
export const riskTone: Record<"low" | "medium" | "high", Tone> = { low: "ok", medium: "warn", high: "bad" };
export const RiskChip = ({ risk }: { risk: "low" | "medium" | "high" }) => <Chip tone={riskTone[risk]}>{risk[0].toUpperCase() + risk.slice(1)} risk</Chip>;
export function AgentAvatar({ agent, size = 32 }: { agent: AiAgent; size?: number }) {
  const c = clientById(agent.clientId);
  return <InitialsBlock initials={agent.name[0]} color={c?.accent ?? "#0d7e8f"} size={size} className="!rounded-full" />;
}
