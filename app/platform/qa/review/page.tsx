import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { platformRuntime, staticSafeSearchParams, STATIC_EXPORT } from "@/lib/server/platform-data";
import { currentUser } from "@/lib/server/auth";
import { qaStore, samplingConfig } from "@/lib/server/qa";
import { tenantName, tenants } from "@/lib/config/catalog";
import { tenantScope } from "@/lib/auth/rbac";
import { buildQueue, queueCounts, type QueueItem } from "@/lib/qa/queue";
import { SAMPLE_REASON_LABELS, type SampleReason } from "@/lib/qa/sampling";
import { REVIEW_STATUS_LABELS, sessionHandlers, verdictAccuracy, type ReviewStatus } from "@/lib/qa/reviews";
import { formatDateTime, pct } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, Stat, Table, Td, Th, buttonClass, cx, type Tone } from "@/components/ui/primitives";
import { OutcomeBadge, SimulatedTag } from "@/components/domain/badges";
import { Pagination, fieldClass, hrefWith, parsePage } from "@/components/platform/pagination";
import { ClaimButton } from "@/components/qa/claim-button";

export const metadata = { title: "QA Review Queue" };

const PAGE_SIZE = 25;
const PATH = "/platform/qa/review";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_TONE: Record<ReviewStatus, Tone> = { queued: "neutral", in_review: "brand", completed: "ok" };
const REASON_TONE: Record<SampleReason, Tone> = { uncertainty_escalation: "warn", model_failure: "danger", human_rejected: "danger", random_ai_resolved: "neutral" };
const STATUSES: ReviewStatus[] = ["queued", "in_review", "completed"];
const REASONS = Object.keys(SAMPLE_REASON_LABELS) as SampleReason[];

function first(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export default async function ReviewQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const rt = await platformRuntime("qa.review", PATH);
  const user = STATIC_EXPORT ? null : await currentUser();
  const sp = await staticSafeSearchParams(searchParams);
  const filters = { status: first(sp.status), reason: first(sp.reason), client: first(sp.client), mine: first(sp.mine) };
  const scope = user ? tenantScope(user) : undefined;
  const config = samplingConfig();
  const store = qaStore();
  const all = buildQueue(rt.states(scope ? { tenantId: scope } : {}), store.reviews, config);

  const beforeStatus = all.filter(
    (i) =>
      (!filters.reason || i.reasons.includes(filters.reason as SampleReason)) &&
      (!filters.client || i.state.session.tenantId === filters.client) &&
      (!filters.mine || (user && i.review?.reviewerId === user.id)),
  );
  const counts = queueCounts(beforeStatus);
  const matched = beforeStatus.filter((i) => !filters.status || i.status === filters.status);
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(parsePage(first(sp.page)), pages);
  const rows = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mineOpen = user ? all.filter((i) => i.status === "in_review" && i.review?.reviewerId === user.id).length : 0;
  const completed = all.filter((i) => i.review?.status === "completed");
  const accuracies = completed.map((i) => verdictAccuracy(i.review!)).filter((a): a is number => a !== undefined);
  const params = { status: filters.status, reason: filters.reason, client: filters.client, mine: filters.mine };
  const visibleTenants = tenants.filter((t) => !scope || t.id === scope);

  return (
    <>
      <div className="mb-3">
        <Link href="/platform/qa" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
          <ArrowLeft className="size-3" aria-hidden /> QA and AI evaluation
        </Link>
      </div>
      <PageHeader
        title="Human review queue"
        description="Completed sessions sampled for QA review. Every session escalated because the evidence was unclear or the AI model failed, and every session with an observation a human rejected, is sampled; so is a fixed share of AI-resolved sessions, chosen by session id so the sample is stable."
        meta={
          <>
            <Badge tone="neutral">AI-resolved sample: {pct(config.aiResolvedRate)}</Badge>
            {scope && <Badge tone="neutral">{tenantName(scope)} only</Badge>}
            <SimulatedTag label="Sessions are simulated" />
          </>
        }
        actions={
          <Link href="/platform/qa/evaluations" className={buttonClass("secondary", "sm")}>
            Evaluation sets
          </Link>
        }
      />

      {STATIC_EXPORT && (
        <div role="note" className="mb-4 flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p>Claiming and submitting reviews needs the server edition. This static demo shows the queue read-only.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Queued" value={counts.queued} hint="Waiting for a reviewer" tone={counts.queued ? "warn" : undefined} />
        <Stat label="In review" value={counts.in_review} hint={user ? `${mineOpen} claimed by you` : "Claimed by a reviewer"} />
        <Stat label="Completed" value={counts.completed} hint={`${all.length} sampled in total`} />
        <Stat
          label="Reviewer-confirmed readings"
          value={accuracies.length ? pct(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : "—"}
          hint={`Mean across ${completed.length} completed review(s)`}
        />
        <Stat label="Sampling" value={pct(config.aiResolvedRate)} hint="of AI-resolved sessions, plus every mandatory case" />
      </div>

      <Panel className="mt-4" bodyClassName="p-0" title="Sessions" description={`${matched.length} matching · newest first`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <Link href={hrefWith(PATH, params, { status: undefined, page: undefined })} className={chip(!filters.status)}>
            All <span className="tabular text-muted">{counts.queued + counts.in_review + counts.completed}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={hrefWith(PATH, params, { status: s, page: undefined })} className={chip(filters.status === s)}>
              {REVIEW_STATUS_LABELS[s]} <span className="tabular text-muted">{counts[s]}</span>
            </Link>
          ))}
          <form action={PATH} className="ml-auto flex flex-wrap items-center gap-2">
            {filters.status && <input type="hidden" name="status" value={filters.status} />}
            <label className="sr-only" htmlFor="qa-reason">
              Why sampled
            </label>
            <select id="qa-reason" name="reason" defaultValue={filters.reason ?? ""} className={fieldClass}>
              <option value="">Any reason</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {SAMPLE_REASON_LABELS[r]}
                </option>
              ))}
            </select>
            {visibleTenants.length > 1 && (
              <>
                <label className="sr-only" htmlFor="qa-client">
                  Client
                </label>
                <select id="qa-client" name="client" defaultValue={filters.client ?? ""} className={fieldClass}>
                  <option value="">All clients</option>
                  {visibleTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {user && (
              <label className="flex items-center gap-1.5 text-xs text-ink-2">
                <input type="checkbox" name="mine" value="1" defaultChecked={Boolean(filters.mine)} /> Claimed by me
              </label>
            )}
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Apply
            </button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nothing to show">No sampled sessions match these filters.</EmptyState>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Session</Th>
                <Th>Client</Th>
                <Th>Ended</Th>
                <Th>Outcome</Th>
                <Th>Why sampled</Th>
                <Th>Review</Th>
                <Th align="right">
                  <span className="sr-only">Action</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <QueueRow key={item.state.session.id} item={item} userId={user?.id} />
              ))}
            </tbody>
          </Table>
        )}
        <Pagination pathname={PATH} params={params} page={page} pageSize={PAGE_SIZE} total={matched.length} />
      </Panel>
    </>
  );
}

function chip(active: boolean): string {
  return cx(
    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
    active ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
  );
}

function QueueRow({ item, userId }: { item: QueueItem; userId?: string }) {
  const s = item.state.session;
  const href = `${PATH}/${s.id}`;
  const review = item.review;
  const mine = Boolean(userId && review?.reviewerId === userId);
  const handled = Boolean(userId && sessionHandlers(item.state).has(userId));
  let action;
  if (!userId) {
    action = (
      <Link href={href} className={buttonClass("secondary", "sm")}>
        View
      </Link>
    );
  } else if (item.status === "completed") {
    action = (
      <Link href={href} className={buttonClass("secondary", "sm")}>
        View review
      </Link>
    );
  } else if (item.status === "in_review") {
    action = mine ? (
      <Link href={href} className={buttonClass("primary", "sm")}>
        Continue review
      </Link>
    ) : (
      <Link href={href} className={buttonClass("ghost", "sm")}>
        View
      </Link>
    );
  } else if (handled) {
    action = <span className="text-xs text-muted">You handled this session</span>;
  } else {
    action = <ClaimButton sessionId={s.id} />;
  }

  return (
    <tr className="align-top hover:bg-surface-2">
      <Td className="whitespace-nowrap">
        <Link href={href} className="font-medium text-brand hover:underline">
          {s.reference}
        </Link>
        <div className="font-mono text-[11px] text-muted">{s.id}</div>
      </Td>
      <Td className="whitespace-nowrap">{tenantName(s.tenantId)}</Td>
      <Td className="tabular whitespace-nowrap">{formatDateTime(s.endedAt)}</Td>
      <Td>
        <OutcomeBadge outcome={s.outcome} />
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {item.reasons.map((r) => (
            <Badge key={r} tone={REASON_TONE[r]}>
              {SAMPLE_REASON_LABELS[r]}
            </Badge>
          ))}
        </div>
      </Td>
      <Td>
        <Badge tone={STATUS_TONE[item.status]}>{REVIEW_STATUS_LABELS[item.status]}</Badge>
        {review && (
          <div className="mt-0.5 text-xs text-muted">
            {review.reviewerName}
            {review.submittedAt ? ` · ${formatDateTime(review.submittedAt)}` : ` · claimed ${formatDateTime(review.claimedAt)}`}
          </div>
        )}
      </Td>
      <Td align="right">{action}</Td>
    </tr>
  );
}
