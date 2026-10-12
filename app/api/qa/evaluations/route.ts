import { runtimeReady } from "@/lib/server/runtime";
import { authorize } from "@/lib/server/auth";
import { jsonError, readJson } from "@/lib/server/http";
import { evaluationProvider, liveEvaluationAvailable, qaStore, type EvaluationProviderKind } from "@/lib/server/qa";
import { runEvaluation } from "@/lib/qa/evaluation";
import { getWorkflow } from "@/lib/config/catalog";

/**
 * Run an evaluation set against a reasoning provider and save the result.
 *   { setId, provider: "simulated" | "claude" }
 * The real model is only used when credentials are configured, and only on
 * this explicit request; the simulated scene reader is the default.
 */
export async function POST(request: Request) {
  const auth = await authorize("qa.evaluate");
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 10_000);
  const kind: EvaluationProviderKind = body?.provider === "claude" ? "claude" : "simulated";
  if (kind === "claude" && !liveEvaluationAvailable()) return jsonError("No model credentials are configured (set ANTHROPIC_API_KEY).", 422);

  const store = qaStore();
  const set = store.evaluationSets().find((s) => s.id === body?.setId);
  if (!set) return jsonError("Evaluation set not found", 404);
  if (set.cases.length === 0) return jsonError("This evaluation set has no cases", 422);
  const workflow = getWorkflow(set.workflowId);
  if (!workflow) return jsonError("The workflow for this set no longer exists", 422);

  const rt = await runtimeReady();
  const run = await runEvaluation(set, {
    ...evaluationProvider(kind),
    workflow,
    startedBy: { id: auth.user.id, name: auth.user.name },
    loadFrame: (sessionId, ref) => rt.getFrame(sessionId, ref),
  });
  store.addRun(run);
  return Response.json({ id: run.id, setId: run.setId, accuracy: run.metrics.accuracy, ece: run.metrics.calibration.ece, casesFailed: run.metrics.casesFailed });
}
