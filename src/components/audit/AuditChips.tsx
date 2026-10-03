import { Chip, type Tone } from "@/components/ui/primitives";
import type { AuditResult } from "@/lib/types/audit";

const tone: Record<AuditResult, Tone> = { Success: "ok", Warning: "warn", Blocked: "bad", Failed: "bad" };
export const ResultChip = ({ result }: { result: AuditResult }) => <Chip tone={tone[result]} dot>{result}</Chip>;
