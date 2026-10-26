import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed, FlaskConical, Headset, Lock, Smartphone, Sparkles, UserRound } from "lucide-react";
import { clientScope, testableWorkflow } from "@/lib/server/client-data";
import { staticSafeSearchParams } from "@/lib/server/platform-data";
import { clientReadiness } from "@/lib/server/client-readiness";
import { users } from "@/lib/config/catalog";
import { ROLE_NAMES } from "@/lib/auth/rbac";
import { formatRelative } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, buttonClass } from "@/components/ui/primitives";
import { OutcomeBadge, SessionStatusBadge } from "@/components/domain/badges";
import { PortalShell, portalHref } from "@/components/client/portal-shell";
import { TestSessionLauncher } from "@/components/shared/test-session-launcher";

export const metadata = { title: "Home" };

export default async function ClientHome({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await staticSafeSearchParams(searchParams);
  const scope = await clientScope("/client", org);
  const { tenant, user } = scope;
  const workflow = testableWorkflow(tenant.id);
  const recent = scope.summaries().slice(0, 5);
  const readiness = clientReadiness(tenant.id);
  const canStart = scope.allows("session.create");
  const canJoin = scope.allows("session.join");
  // Who on this client's team can run the whole trial, for people who can only look.
  const operators = users.filter((u) => u.tenantId === tenant.id && (u.role === "supervisor" || u.role === "agent") && u.status === "active");

  const abilities: { label: string; yes: boolean }[] = [
    { label: "Start test sessions and send the customer link", yes: canStart },
    { label: "Join a session and take over from the AI", yes: scope.allows("session.take_over") },
    { label: "See every session, what the AI saw and what it did", yes: scope.allows("session.view") },
    { label: "Change workflows, policies and connected systems (Admin tools)", yes: scope.allows("settings.edit") },
  ];

  return (
    <PortalShell scope={scope} active="home">
      <PageHeader
        title={`Try Visual Assist with ${tenant.brand.displayName}`}
        description="Run a real support session end to end: the customer shows a problem on their phone camera, the AI helps, and a person takes over when needed."
        meta={user ? <Badge tone="neutral">{user.name} · {ROLE_NAMES[user.role]}</Badge> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Try it in four steps" description="About ten minutes. You need a phone and a laptop." className="lg:col-span-2">
          <ol className="space-y-4">
            <Step n={1} title="Start a test session" done={false}>
              {canStart && workflow ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <TestSessionLauncher tenantId={tenant.id} workflowKey={workflow.key} workflowName={workflow.name} liveOnly={!workflow.scenarios} />
                  <span className="text-xs text-muted">Choose Live AI to use your own phone camera, or a scripted scenario to see each outcome.</span>
                </div>
              ) : (
                <Blocked canStart={canStart} hasWorkflow={Boolean(workflow)} role={user ? ROLE_NAMES[user.role] : "your role"} operators={operators.map((u) => `${u.name} (${ROLE_NAMES[u.role]})`)} />
              )}
            </Step>
            <Step n={2} title="Open the customer link on your phone">
              <p className="mt-1 text-sm text-ink-2">
                Type your mobile number when you start the session and the link arrives by text. Otherwise copy the link and open it on the phone. The customer agrees to a short privacy
                notice, then turns on the camera.
              </p>
            </Step>
            <Step n={3} title="Show the problem and talk to the AI">
              <p className="mt-1 text-sm text-ink-2">
                Say what&apos;s wrong and show it to the camera. The AI only follows the approved steps, tells you how sure it is about what it sees, and asks for a better view when it is not sure.
                Press <strong>Human help</strong> on the phone at any time.
              </p>
            </Step>
            <Step n={4} title="Join as the agent and take over">
              {canJoin ? (
                <div className="mt-2">
                  <Link href="/console" className={buttonClass("secondary", "sm")}>
                    <Headset className="size-3.5" aria-hidden /> Open the live queue
                  </Link>
                  <span className="ml-2 text-xs text-muted">Press Join session, then Take over. You see the whole conversation and the photos, so the customer repeats nothing.</span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-ink-2">
                  Joining a session is done by a supervisor or agent{operators.length ? `, for example ${operators[0].name}` : ""}. You can still watch every session on the Sessions page.
                </p>
              )}
            </Step>
          </ol>
        </Panel>

        <div className="space-y-4">
          <Panel title="What's switched on" description="What this version really does for your trial">
            <ul className="space-y-2.5">
              {readiness.map((r) => (
                <li key={r.label} className="flex items-start gap-2 text-[13px]">
                  {r.state === "on" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="On" />
                  ) : r.state === "demo" ? (
                    <FlaskConical className="mt-0.5 size-4 shrink-0 text-brand" aria-label="Demo" />
                  ) : (
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Off" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{r.label}</span>
                    <span className="block text-xs text-muted">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="What your role can do">
            <ul className="space-y-2">
              {abilities.map((a) => (
                <li key={a.label} className="flex items-start gap-2 text-[13px]">
                  {a.yes ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Yes" /> : <Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Not with your role" />}
                  <span className={a.yes ? "text-ink" : "text-muted"}>{a.label}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel
        className="mt-4"
        title="Your latest sessions"
        description={`Only ${tenant.name} sessions are shown`}
        actions={
          <Link href={portalHref(scope, "/client/sessions")} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            All sessions <ArrowRight className="size-3" aria-hidden />
          </Link>
        }
        bodyClassName="p-0"
      >
        {recent.length === 0 ? (
          <EmptyState title="No sessions yet" icon={<Smartphone className="size-5" aria-hidden />}>
            Start a test session above. It will appear here as soon as it is created.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={portalHref(scope, `/client/sessions/${s.id}`)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">
                      {s.reference} <span className="font-normal text-muted">· {s.workflowName}</span>
                    </span>
                    <span className="block text-xs text-muted">
                      {formatRelative(s.startedAt ?? s.createdAt)} · {s.scenario ? "Scripted scenario" : "Live AI"}
                      {s.issue ? ` · ${s.issue}` : ""}
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

      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          The AI can be wrong, which is why every reading shows how sure it is and why a person can take over at any point. Your feedback on what felt right or wrong is the most useful
          result of this trial.
        </span>
      </p>
    </PortalShell>
  );
}

function Step({ n, title, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white" aria-hidden>
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function Blocked({ canStart, hasWorkflow, role, operators }: { canStart: boolean; hasWorkflow: boolean; role: string; operators: string[] }) {
  return (
    <p className="mt-1 flex items-start gap-2 text-sm text-ink-2">
      <UserRound className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <span>
        {!hasWorkflow
          ? "No published workflow is available to try yet."
          : !canStart
            ? `Starting a session is not part of the ${role} role.${operators.length ? ` Sign in as ${operators.join(" or ")} to run the whole trial.` : ""}`
            : ""}
      </span>
    </p>
  );
}
