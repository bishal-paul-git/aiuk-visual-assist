import { platformRuntime } from "@/lib/server/platform-data";
import { serverNow } from "@/lib/format";
import { QueueBoard } from "@/components/console/queue-board";

export const metadata = { title: "Live queue" };

export default async function ConsoleHome() {
  const rt = await platformRuntime();
  const sessions = rt.summaries().filter((s) => s.live);
  return <QueueBoard initial={sessions} serverNow={serverNow()} />;
}
