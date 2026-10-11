import type { FrameTrigger } from "@/lib/domain/types";
export { formatTimeSec } from "@/lib/format";

const TRIGGERS: Record<FrameTrigger, string> = {
  scheduled_sample: "Scheduled sample",
  ai_request: "AI request",
  workflow_checkpoint: "Workflow checkpoint",
  customer_capture: "Customer capture",
  scene_change: "Scene change",
  human_request: "Agent request",
  uncertainty_confirmation: "Re-capture (uncertain)",
};

export function humanizeTrigger(t: FrameTrigger): string {
  return TRIGGERS[t] ?? t;
}
