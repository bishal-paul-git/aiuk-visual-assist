import Link from "next/link";
import { AutoRefresh } from "@/components/client/auto-refresh";
import { ArrowRight, CheckCircle2, CircleDashed, FlaskConical, Smartphone, UserRound } from "lucide-react";
import { clientScope, testableWorkflow } from "@/lib/server/client-data";
import { STATIC_EXPORT, staticSafeSearchParams } from "@/lib/server/platform-data";
import { describeCapabilities } from "@/lib/server/capabilities";
import { clientReadiness } from "@/lib/server/client-readiness";
import { users } from "@/lib/config/catalog";
import { ROLE_NAMES } from "@/lib/auth/rbac";
import { formatRelative } from "@/lib/format";
import { EmptyState, PageHeader, Panel } from "@/components/ui/primitives";
import { OutcomeBadge, SessionStatusBadge } from "@/components/domain/badges";
import { PortalShell, portalHref } from "@/components/client/portal-shell";
import { TrialFlow } from "@/components/client/trial-flow";

export const metadata = { title: "Try it" };


export default async function ClientHome({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await staticSafeSearchParams(searchParams);
  const scope = await clientScope("/client", org);
  const { tenant, user } = scope;
  const workflow = testableWorkflow(tenant.id);
  const caps = STATIC_EXPORT ? undefined : describeCapabilities();
  const readiness = clientReadiness(tenant.id);
  const canStart = scope.allows("session.create");
  const recent = scope.summaries().slice(0, 4);
  const operators = users.filter((u) => u.tenantId === tenant.id && (u.role === "supervisor" || u.role === "agent") && u.status === "active" && u.id !== "usr_demo");

  if (tenant.featureFlags.private_client) {
    const operator = scope.allows("session.create");
    return (
      <PortalShell scope={scope} active="home">
        <PageHeader title={`${tenant.brand.displayName} · Visual Assist`} description="Your live service: real customers, real AI, your team." />
        <div className="grid gap-4 md:grid-cols-3" data-testid="live-service">
          <Panel title="Help a customer now">
            <p className="text-sm text-ink-2">
              {operator
                ? "Open the agent console. Press “Send a customer link” to text the customer a secure link while you are on the phone. You get an alert when someone needs a person."
                : "Your agents and team leaders work in the agent console."}
            </p>
            {operator && (
              <Link href="/console" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                Open the agent console <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </Panel>
          <Panel title="Pilot results">
            <p className="text-sm text-ink-2">Fixed by the AI, handed to a person, customer ratings and cost. Download the report as a spreadsheet.</p>
            <Link href={portalHref(scope, "/client/results")} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              See results <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Panel>
          <Panel title="Every conversation">
            <p className="text-sm text-ink-2">Transcript, what the AI saw, steps taken and the outcome of each customer session.</p>
            <Link href={portalHref(scope, "/client/sessions")} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              See conversations <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Panel>
        </div>
        <RecentPanel scope={scope} recent={recent} />
      </PortalShell>
    );
  }

  return (
    <PortalShell scope={scope} active="home">
      <PageHeader
        title="Try Visual Assist"
        description={`Play both sides of a real support conversation for ${tenant.brand.displayName}: the customer who needs help, and the agent who steps in.`}
      />

      {canStart && workflow ? (
        <TrialFlow
          tenantId={tenant.id}
          workflowKey={workflow.key}
          workflowName={workflow.name}
          hasExamples={workflow.scenarios}
          liveAi={Boolean(caps?.liveReasoning)}
          sms={Boolean(caps && !caps.delivery.sms.simulated)}
          canStart
          reportHref={portalHref(scope, "/client/sessions")}
        />
      ) : (
        <Panel title="Start a conversation">
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <UserRound className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span>
              {!workflow
                ? "No published workflow is available to try yet."
                : `Starting a conversation is not part of the ${user ? ROLE_NAMES[user.role] : "current"} role.${operators.length ? ` Log in as ${operators.map((u) => `${u.name} (${ROLE_NAMES[u.role]})`).join(" or ")} to try it.` : ""}`}
            </span>
          </p>
        </Panel>
      )}

      <RecentPanel scope={scope} recent={recent} />

      <details className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
        <summary className="cursor-pointer text-[13px] font-medium text-ink-2 select-none">What&apos;s included in this trial</summary>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {readiness.map((r) => (
            <li key={r.label} className="flex items-start gap-2 text-[13px]">
              {r.state === "on" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="On" /> : r.state === "demo" ? <FlaskConical className="mt-0.5 size-4 shrink-0 text-brand" aria-label="Demo" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Off" />}
              <span className="min-w-0">
                <span className="block font-medium text-ink">{r.label}</span>
                <span className="block text-xs text-muted">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </PortalShell>
  );
}

function RecentPanel({ scope, recent }: { scope: Awaited<ReturnType<typeof clientScope>>; recent: ReturnType<Awaited<ReturnType<typeof clientScope>>["summaries"]> }) {
  return (
      <div className="mt-4">
        <Panel
          title="Your latest conversations"
          actions={
            <Link href={portalHref(scope, "/client/sessions")} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              All <ArrowRight className="size-3" aria-hidden />
            </Link>
          }
          bodyClassName="p-0"
        >
          <AutoRefresh />
          {recent.length === 0 ? (
            <EmptyState title="Nothing yet" icon={<Smartphone className="size-5" aria-hidden />}>
              Your conversations will appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href={portalHref(scope, `/client/sessions/${s.id}`)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{s.reference}</span>
                      <span className="block text-xs text-muted">
                        {formatRelative(s.startedAt ?? s.createdAt)} · {s.scenario ? "Guided example" : "Real AI"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <SessionStatusBadge status={s.status} />
                      <OutcomeBadge outcome={s.outcome} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
  );
}
