import { connection } from "next/server";
import { getRuntime } from "@/lib/server/runtime";
import { serverNow } from "@/lib/format";
import { QueueBoard } from "@/components/console/queue-board";

export const metadata = { title: "Live queue" };

export default async function ConsoleHome() {
  await connection();
  const sessions = getRuntime().summaries().filter((s) => s.live);
  return <QueueBoard initial={sessions} serverNow={serverNow()} />;
}
