import { notFound } from "next/navigation";
import { getRuntime } from "@/lib/server/runtime";
import { serverNow } from "@/lib/format";
import { ConsoleSession } from "@/components/console/console-session";
import { requirePageUser } from "@/lib/server/auth";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ref = getRuntime().get(id)?.state.session.reference;
  return { title: ref ? `Session ${ref}` : "Session" };
}

/** Static demo: prerender the in-flight demo sessions; others open via /console/s?id=. */
export async function generateStaticParams() {
  return getRuntime()
    .summaries()
    .filter((s) => s.live)
    .map((s) => ({ id: s.id }));
}

export default async function ConsoleSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = getRuntime().get(id);
  if (!entry) notFound();
  await requirePageUser("session.view", `/console/sessions/${id}`, { tenantId: entry.state.session.tenantId });
  const view = getRuntime().agentView(id);
  if (!view) notFound();
  return <ConsoleSession id={id} initial={view} serverNow={serverNow()} />;
}
