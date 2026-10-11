import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { getRuntime } from "@/lib/server/runtime";
import { serverNow } from "@/lib/format";
import { AssistApp } from "@/components/assist/assist-app";

export const metadata: Metadata = { title: "Visual support", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#06090f" };

export default async function AssistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rt = getRuntime();
  const id = rt.idForToken(token);
  const view = id ? rt.customerView(id) : undefined;
  if (!view) notFound();
  return <AssistApp token={token} initial={view} serverNow={serverNow()} />;
}
