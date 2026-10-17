import { log } from "@/lib/server/log";

/**
 * Keep the process alive until `work` settles (or `timeoutMs` passes), for
 * stores that can only be written asynchronously (Postgres).
 *
 * `next start` handles SIGTERM itself: it closes the HTTP server and then
 * calls process.exit(). Nothing would wait for an asynchronous flush, so while
 * the flush runs, process.exit() is held and replayed once it finishes. With
 * NEXT_MANUAL_SIG_HANDLE set, Next.js does not exit, so this exits after the
 * flush instead.
 */
export function holdExitUntil(work: Promise<unknown>, opts: { timeoutMs: number; signal: NodeJS.Signals }): void {
  const realExit = process.exit.bind(process);
  let finished = false;
  let requested: { code: number | string | null | undefined } | undefined;

  process.exit = ((code?: number | string | null) => {
    if (finished) return realExit(code);
    requested = { code };
    return undefined as never;
  }) as typeof process.exit;

  const finish = (outcome: "flushed" | "timed_out" | "failed", err?: unknown) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    process.exit = realExit;
    if (outcome === "flushed") log.info("store.shutdown_flushed", { signal: opts.signal });
    else log.error("store.shutdown_flush_incomplete", { signal: opts.signal, outcome, err });
    if (requested) realExit(requested.code ?? undefined);
    else if (process.env.NEXT_MANUAL_SIG_HANDLE) realExit(opts.signal === "SIGINT" ? 130 : 143);
  };

  const timer = setTimeout(() => finish("timed_out"), opts.timeoutMs);
  work.then(
    () => finish("flushed"),
    (err) => finish("failed", err),
  );
}
