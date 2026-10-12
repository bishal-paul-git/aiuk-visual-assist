import Link from "next/link";
import { ArrowLeft, FlaskConical, Info } from "lucide-react";
import { platformRuntime, staticSafeSearchParams, STATIC_EXPORT } from "@/lib/server/platform-data";
import { currentUser } from "@/lib/server/auth";
import { liveEvaluationAvailable, qaStore } from "@/lib/server/qa";
import { can } from "@/lib/auth/rbac";
import { getWorkflow } from "@/lib/config/catalog";
import { DEFAULT_MODEL } from "@/lib/providers/claude/reasoning";
import { runEvaluation, CANNOT_TELL, DECLINED, NOT_REPORTED, type EvalCase, type EvaluationRun, type EvaluationSet, type ItemOutcome } from "@/lib/qa/evaluation";
import { SceneVisionProvider } from "@/lib/qa/scene-vision";
import { EVAL_TAG_LABELS } from "@/lib/qa/router-eval-set";
import { frameSrc, syntheticFrameSrc } from "@/lib/media/frame-src";
import { humanize } from "@/lib/domain/labels";
import { confidencePct, formatDateTime, pct } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, Stat, Table, Td, Th, cx, type Tone } from "@/components/ui/primitives";
import { SimulatedTag } from "@/components/domain/badges";
import { CalibrationTable, eceVerdict } from "@/components/qa/calibration-table";
import { RunEvaluation } from "@/components/qa/run-evaluation";

export const metadata = { title: "Evaluation Sets" };

const PATH = "/platform/qa/evaluations";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const OUTCOME: Record<ItemOutcome, { label: string; tone: Tone }> = {
  correct: { label: "Correct", tone: "ok" },
  correct_abstention: { label: "Correctly declined", tone: "ok" },
  incorrect: { label: "Wrong value", tone: "danger" },
  hallucinated: { label: "Hallucinated", tone: "danger" },
  abstained: { label: "Declined", tone: "warn" },
  missing: { label: "Not reported", tone: "warn" },
};

function first(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

function imageSrc(c: EvalCase): string | undefined {
  if (c.image.kind === "synthetic") return syntheticFrameSrc(c.image.ref);
  return c.image.visualEventId ? frameSrc(c.image.sessionId, { id: c.image.visualEventId, frameReference: c.image.frameReference }) : undefined;
}

/** The simulated provider over the set, computed on page load and not saved, so the page is never empty. */
async function baselineRun(set: EvaluationSet): Promise<EvaluationRun | undefined> {
  const workflow = getWorkflow(set.workflowId);
  if (!workflow || set.cases.length === 0) return undefined;
  return runEvaluation(set, {
    id: "baseline",
    provider: new SceneVisionProvider(),
    providerLabel: "Simulated scene reader",
    workflow,
    startedBy: { id: "system", name: "System (baseline, not saved)" },
  });
}

export default async function EvaluationsPage({ searchParams }: { searchParams: SearchParams }) {
  await platformRuntime("platform.access", PATH);
  const user = STATIC_EXPORT ? null : await currentUser();
  const sp = await staticSafeSearchParams(searchParams);
  const store = qaStore();
  const sets = store.evaluationSets();
  const set = sets.find((s) => s.id === first(sp.set)) ?? sets[0];
  const runs = store.runs.filter((r) => r.setId === set.id);
  const requested = runs.find((r) => r.id === first(sp.run));
  const run = requested ?? runs[0] ?? (await baselineRun(set));
  const isBaseline = run?.id === "baseline";
  const canRun = Boolean(user && can(user, "qa.evaluate"));
  const live = liveEvaluationAvailable();
  const caseById = new Map(set.cases.map((c) => [c.id, c]));
  const m = run?.metrics;
  const ece = eceVerdict(m?.calibration.ece);

  return (
    <>
      <div className="mb-3">
        <Link href="/platform/qa" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
          <ArrowLeft className="size-3" aria-hidden /> QA and AI evaluation
        </Link>
      </div>
      <PageHeader
        title="Evaluation sets"
        description="Labelled images with the readings a correct model should give. Run a set against a reasoning provider to measure accuracy per observation type, which values it confuses, how often it invents a reading it cannot see, and whether its confidence matches how often it is right (docs/08 §2)."
        meta={
          <>
            <Badge tone="neutral">
              {set.cases.length} cases · v{set.version}
            </Badge>
            <Badge tone={live ? "ok" : "neutral"}>{live ? "Real model available" : "Real model not configured"}</Badge>
          </>
        }
        actions={
          canRun && !STATIC_EXPORT ? <RunEvaluation setId={set.id} liveAvailable={live} liveModel={live ? process.env.VISUAL_ASSIST_MODEL || DEFAULT_MODEL : undefined} /> : undefined
        }
      />

      {sets.length > 1 && (
        <nav aria-label="Evaluation sets" className="mb-4 flex flex-wrap gap-2">
          {sets.map((s) => (
            <Link
              key={s.id}
              href={`${PATH}?set=${encodeURIComponent(s.id)}`}
              className={cx(
                "rounded-md border px-2.5 py-1 text-xs font-medium",
                s.id === set.id ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              {s.name} <span className="tabular text-muted">{s.cases.length}</span>
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-4 space-y-2">
        <p className="text-sm text-ink-2">{set.description}</p>
        {STATIC_EXPORT ? (
          <div role="note" className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <p>Running evaluations needs the server edition. This static demo shows the simulated provider&apos;s results, computed when the page was built.</p>
          </div>
        ) : (
          !canRun && (
            <div role="note" className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
              <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <p>Your role can read evaluation results but not run them.</p>
            </div>
          )
        )}
        {run?.provider.simulated && (
          <div role="note" className="flex items-start gap-2 rounded-md border border-dashed border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn">
            <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              These results come from a simulated scene reader with deliberate, known weaknesses (it reads amber as red, and declines under glare). They show the
              evaluation pipeline working; they say nothing about a real model. Run the set against the real model for real figures.
            </p>
          </div>
        )}
      </div>

      {!run || !m ? (
        <EmptyState title="No results">This set has no cases to run.</EmptyState>
      ) : (
        <>
          <Panel
            title={isBaseline ? "Baseline run (not saved)" : "Run results"}
            description={`${run.provider.label}${run.provider.model ? ` · ${run.provider.model}` : ""} · ${formatDateTime(run.finishedAt)} · started by ${run.startedBy.name}`}
            actions={run.provider.simulated ? <SimulatedTag label="Simulated provider" /> : <Badge tone="violet">Real model</Badge>}
            bodyClassName="p-3"
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Accuracy" value={pct(m.accuracy)} hint={`${m.items} expected readings in ${m.cases - m.casesFailed} cases`} />
              <Stat label="Accuracy when it answered" value={m.answeredAccuracy === undefined ? "—" : pct(m.answeredAccuracy)} hint={`${m.answered} committed readings`} />
              <Stat label="Coverage" value={m.coverage === undefined ? "—" : pct(m.coverage)} hint="Readable items it gave a value for" />
              <Stat
                label="Hallucination rate"
                value={m.hallucinationRate === undefined ? "—" : pct(m.hallucinationRate)}
                tone={m.hallucinations ? "danger" : "ok"}
                hint={`${m.hallucinations} value(s) given for items that cannot be seen`}
              />
              <Stat label="Calibration error (ECE)" value={m.calibration.ece === undefined ? "—" : m.calibration.ece.toFixed(3)} tone={ece.tone} hint={ece.label} />
              <Stat label="Cases failed" value={m.casesFailed} tone={m.casesFailed ? "danger" : undefined} hint="Provider errors; left out of the scores" />
            </div>
          </Panel>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel title="Accuracy by observation type" description="Correct readings plus correct refusals, over all expected readings of that type" bodyClassName="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th align="right">Items</Th>
                    <Th align="right">Correct</Th>
                    <Th align="right">Wrong</Th>
                    <Th align="right">Hallucinated</Th>
                    <Th align="right">Declined</Th>
                    <Th align="right">Accuracy</Th>
                  </tr>
                </thead>
                <tbody>
                  {m.byType.map((t) => (
                    <tr key={t.observationType}>
                      <Td className="font-mono text-xs text-ink">{t.observationType}</Td>
                      <Td align="right">{t.items}</Td>
                      <Td align="right">{t.correct + t.correctAbstentions}</Td>
                      <Td align="right" className={t.incorrect ? "font-semibold text-danger" : undefined}>
                        {t.incorrect}
                      </Td>
                      <Td align="right" className={t.hallucinated ? "font-semibold text-danger" : undefined}>
                        {t.hallucinated}
                      </Td>
                      <Td align="right">{t.abstained + t.missing}</Td>
                      <Td align="right" className="font-medium text-ink">
                        {pct(t.accuracy)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Panel>

            <Panel
              title="Confidence calibration"
              description="For readings the provider committed to: its reported confidence against how often it was right, in 10-point bins. ECE is the reading-weighted mean gap."
              bodyClassName="p-0"
            >
              {m.calibration.points === 0 ? (
                <p className="px-4 py-6 text-sm text-muted">The provider committed to no readings.</p>
              ) : (
                <CalibrationTable bins={m.calibration.bins} hideEmpty />
              )}
            </Panel>
          </div>

          <Panel
            title="Confusion counts"
            description={`Expected value (rows) against what the provider reported (columns). “${CANNOT_TELL}” means the item cannot be seen in the image; “${DECLINED}” means the provider gave no value.`}
            className="mt-4"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(m.confusion).map(([type, rows]) => {
                const cols = [...new Set(Object.values(rows).flatMap((r) => Object.keys(r)))].sort(sortSpecialLast);
                const rowKeys = Object.keys(rows).sort(sortSpecialLast);
                return (
                  <div key={type} className="min-w-0 rounded-md border border-line">
                    <div className="border-b border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-ink">{type}</div>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Expected ↓ / reported →</Th>
                          {cols.map((c) => (
                            <Th key={c} align="right">
                              {c}
                            </Th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rowKeys.map((r) => (
                          <tr key={r}>
                            <Td className="whitespace-nowrap font-medium text-ink">{r}</Td>
                            {cols.map((c) => {
                              const n = rows[r][c] ?? 0;
                              const diagonal = c === r || (r === CANNOT_TELL && (c === DECLINED || c === NOT_REPORTED));
                              return (
                                <Td key={c} align="right" className={n === 0 ? "text-muted" : diagonal ? "font-semibold text-ok" : "font-semibold text-danger"}>
                                  {n}
                                </Td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                );
              })}
            </div>
          </Panel>

          {m.byTag.length > 0 && (
            <Panel title="Accuracy by condition" description="How the provider did on each kind of scene" className="mt-4" bodyClassName="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Condition</Th>
                    <Th align="right">Readings</Th>
                    <Th align="right">Accuracy</Th>
                  </tr>
                </thead>
                <tbody>
                  {m.byTag.map((t) => (
                    <tr key={t.tag}>
                      <Td className="text-ink">{EVAL_TAG_LABELS[t.tag] ?? humanize(t.tag)}</Td>
                      <Td align="right">{t.items}</Td>
                      <Td align="right" className={t.accuracy < 1 ? "font-semibold text-warn" : "font-medium text-ink"}>
                        {pct(t.accuracy)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          )}

          <Panel title="Case results" description="Each labelled image, the expected readings and what the provider reported" className="mt-4" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Image</Th>
                  <Th>Case</Th>
                  <Th>Expected → reported</Th>
                </tr>
              </thead>
              <tbody>
                {run.results.map((r) => {
                  const c = caseById.get(r.caseId);
                  const src = c ? imageSrc(c) : undefined;
                  return (
                    <tr key={r.caseId} className="align-top">
                      <Td className="w-[132px]">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={`Evaluation image: ${r.title}`} width={120} height={90} loading="lazy" className="aspect-[4/3] w-[120px] rounded border border-line bg-surface-2 object-cover" />
                        ) : (
                          <span className="text-xs text-muted">No preview</span>
                        )}
                      </Td>
                      <Td className="min-w-[180px]">
                        <div className="font-medium text-ink">{r.title}</div>
                        <div className="font-mono text-[11px] text-muted">
                          {r.caseId}
                          {c && ` · ${c.checkpoint}`}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <Badge key={t} tone="neutral">
                              {EVAL_TAG_LABELS[t] ?? humanize(t)}
                            </Badge>
                          ))}
                        </div>
                        {c?.source && (
                          <div className="mt-1 text-[11px] text-muted">
                            From review of{" "}
                            <Link href={`/platform/qa/review/${c.source.sessionId}`} className="text-brand hover:underline">
                              {c.source.reference}
                            </Link>
                          </div>
                        )}
                      </Td>
                      <Td>
                        {r.error ? (
                          <span className="text-[13px] text-danger">{r.error}</span>
                        ) : (
                          <ul className="space-y-1">
                            {r.items.map((i) => (
                              <li key={i.observationType} className="flex flex-wrap items-center gap-2 text-[13px]">
                                <span className="w-32 shrink-0 font-mono text-xs text-muted">{i.observationType}</span>
                                <span className="text-ink">{i.expected ?? <span className="text-muted">cannot tell</span>}</span>
                                <span aria-hidden className="text-muted">
                                  →
                                </span>
                                <span className="text-ink">{i.predicted ?? <span className="text-muted">{i.status ? humanize(i.status) : "not reported"}</span>}</span>
                                {i.confidence !== undefined && <span className="tabular text-xs text-muted">{confidencePct(i.confidence)}</span>}
                                <Badge tone={OUTCOME[i.outcome].tone}>{OUTCOME[i.outcome].label}</Badge>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Panel>
        </>
      )}

      <Panel title="Run history" description={`Saved runs of this set (newest first, up to 50 across all sets)${STATIC_EXPORT ? " — none in the static demo" : ""}`} className="mt-4" bodyClassName="p-0">
        {runs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No saved runs yet.{canRun ? " Choose a provider and select Run." : ""}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Finished</Th>
                <Th>Provider</Th>
                <Th>Started by</Th>
                <Th align="right">Accuracy</Th>
                <Th align="right">Hallucinations</Th>
                <Th align="right">ECE</Th>
                <Th align="right">Failed</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={cx(r.id === run?.id && "bg-brand-soft/40")}>
                  <Td className="whitespace-nowrap">
                    <Link href={`${PATH}?set=${encodeURIComponent(set.id)}&run=${encodeURIComponent(r.id)}`} className="font-medium text-brand hover:underline">
                      {formatDateTime(r.finishedAt)}
                    </Link>
                  </Td>
                  <Td>
                    {r.provider.label}
                    {r.provider.simulated && <span className="ml-1.5 text-xs text-muted">(simulated)</span>}
                  </Td>
                  <Td>{r.startedBy.name}</Td>
                  <Td align="right">{pct(r.metrics.accuracy)}</Td>
                  <Td align="right">{r.metrics.hallucinations}</Td>
                  <Td align="right">{r.metrics.calibration.ece === undefined ? "—" : r.metrics.calibration.ece.toFixed(3)}</Td>
                  <Td align="right">{r.metrics.casesFailed}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

function sortSpecialLast(a: string, b: string): number {
  const special = (s: string) => s.startsWith("(");
  return Number(special(a)) - Number(special(b)) || a.localeCompare(b);
}
