import { connection } from "next/server";
import { getRuntime } from "@/lib/server/runtime";
import { requirePageUser } from "@/lib/server/auth";
import { STATIC_EXPORT } from "@/lib/server/platform-data";
import { tenantScope } from "@/lib/auth/rbac";
import { serverNow } from "@/lib/format";
import { QueueBoard } from "@/components/console/queue-board";

export const metadata = { title: "Live queue" };

export default async function ConsoleHome() {
  if (!STATIC_EXPORT) await connection();
  const user = await requirePageUser("session.view", "/console");
  // Agents, supervisors and client admins only see their own organisation's queue.
  const sessions = getRuntime()
    .summaries({ tenantId: user ? tenantScope(user) : undefined })
    .filter((s) => s.live);
  return <QueueBoard initial={sessions} serverNow={serverNow()} />;
}
