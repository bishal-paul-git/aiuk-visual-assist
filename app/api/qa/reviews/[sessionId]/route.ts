import { runtimeReady } from "@/lib/server/runtime";
import { authorize } from "@/lib/server/auth";
import { jsonError, readJson } from "@/lib/server/http";
import { qaStore, recordQaAudit, samplingConfig } from "@/lib/server/qa";
import { sampleReasons } from "@/lib/qa/sampling";
import { claimReview, QaReviewError, releaseReview, submitReview } from "@/lib/qa/reviews";
import { casesFromReview } from "@/lib/qa/evaluation";
import { ROUTER_EVAL_SET } from "@/lib/qa/router-eval-set";
import { getWorkflow } from "@/lib/config/catalog";

/**
 * QA review actions on one session (docs/08 §2):
 *   { action: "claim" }    queued → in_review for the signed-in reviewer
 *   { action: "release" }  in_review → queued (claimant only)
 *   { action: "submit", verdicts, outcome, scores, notes, addToEvaluationSet? }  in_review → completed
 * Requires qa.review on the session's tenant. Reviewers cannot review sessions they handled.
 */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const rt = await runtimeReady();
  const entry = rt.get(sessionId);
  if (!entry) return jsonError("Session not found", 404);
  const auth = await authorize("qa.review", { tenantId: entry.state.session.tenantId }, { sessionId });
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 200_000);
  if (!body) return jsonError("Invalid request body");

  const store = qaStore();
  const reviewer = { id: auth.user.id, name: auth.user.name };
  const now = new Date().toISOString();
  try {
    switch (body.action) {
      case "claim": {
        const reasons = sampleReasons(entry.state, samplingConfig());
        const { review, created } = claimReview(store.reviews, { state: entry.state, reviewer, reasons, now, id: `qar_${globalThis.crypto.randomUUID().slice(0, 12)}` });
        if (created) {
          store.changed();
          recordQaAudit(sessionId, "qa.review_claimed", { reviewId: review.id, sampleReasons: review.sampleReasons }, auth.user);
        }
        return Response.json(review);
      }
      case "release": {
        const review = releaseReview(store.reviews, sessionId, reviewer);
        store.changed();
        recordQaAudit(sessionId, "qa.review_released", { reviewId: review.id }, auth.user);
        return Response.json({ status: "queued" });
      }
      case "submit": {
        const review = submitReview(store.reviews, { state: entry.state, reviewer, body, vocabulary: entry.workflow.observationVocabulary, now });
        let casesAdded = 0;
        const evalWorkflow = getWorkflow(ROUTER_EVAL_SET.workflowId);
        if (body.addToEvaluationSet === true && evalWorkflow && entry.workflow.key === evalWorkflow.key) {
          casesAdded = store.addCases(casesFromReview(review, entry.state, reviewer.name, now));
        }
        store.changed();
        const incorrect = review.verdicts.filter((v) => v.verdict === "incorrect").length;
        recordQaAudit(
          sessionId,
          "qa.review_submitted",
          {
            reviewId: review.id,
            verdicts: review.verdicts.length,
            incorrect,
            outcomeCorrect: review.outcome?.correct,
            expectedOutcome: review.outcome?.expected,
            scores: review.scores,
            casesAdded,
          },
          auth.user,
        );
        return Response.json({ ...review, casesAdded });
      }
      default:
        return jsonError("Unknown action");
    }
  } catch (e) {
    if (e instanceof QaReviewError) return Response.json({ error: e.message, details: e.details }, { status: e.status });
    throw e;
  }
}
