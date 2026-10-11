import { notFound } from "next/navigation";
import { getRuntime } from "@/lib/server/runtime";
import { serverNow } from "@/lib/format";
import { ConsoleSession } from "@/components/console/console-session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ref = getRuntime().get(id)?.state.session.reference;
  return { title: ref ? `Session ${ref}` : "Session" };
}

export default async function ConsoleSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = getRuntime().agentView(id);
  if (!view) notFound();
  return <ConsoleSession id={id} initial={view} serverNow={serverNow()} />;
}
