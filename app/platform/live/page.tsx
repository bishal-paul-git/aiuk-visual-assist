import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { platformScope } from "@/lib/server/platform-data";
import { tenants } from "@/lib/config/catalog";
import type { SessionSummaryView } from "@/lib/session/projections";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { LiveSessionsBoard } from "@/components/platform/live-sessions-board";

export const metadata = { title: "Live Sessions" };

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Snapshot taken once per request (kept out of render for purity). */
function boardSnapshot(summaries: SessionSummaryView[], serverNow = Date.now()) {
  const live = summaries.filter((s) => s.live);
  const recentEnded = summaries
    .filter((s) => !s.live && s.endedAt && serverNow - Date.parse(s.endedAt) < RECENT_WINDOW_MS)
    .sort((a, b) => b.endedAt!.localeCompare(a.endedAt!))
    .slice(0, 10);
  return { live, recentEnded, serverNow };
}

export default async function LiveSessionsPage() {
  const scope = await platformScope();
  const { live, recentEnded, serverNow } = boardSnapshot(scope.summaries());
  const tenantNames = Object.fromEntries([...scope.filter(tenants.map((t) => ({ tenantId: t.id, name: t.name }))).map((t) => [t.tenantId, t.name]), ...(scope.allClients ? [["aiuk", "Absolute Intelligence UK"]] : [])]);

  return (
    <>
      <PageHeader
        title="Live sessions"
        description="Operations wallboard. Updates in real time as sessions move between the AI, the queue and human agents."
        meta={<Badge tone="neutral">{scope.label}</Badge>}
        actions={
          <Link href="/console" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            Open agent console <ArrowRight className="size-3" aria-hidden />
          </Link>
        }
      />
      <LiveSessionsBoard initial={live} recentEnded={recentEnded} serverNow={serverNow} tenants={tenantNames} />
    </>
  );
}
