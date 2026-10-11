/**
 * Server-Sent Events helper: pushes a fresh snapshot whenever the subscription
 * fires (coalesced per tick), with a heartbeat to keep proxies from idling out.
 */
export function sseResponse(
  request: Request,
  subscribe: (onChange: () => void) => () => void,
  snapshot: () => unknown,
): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let pending = false;
      const send = () => {
        pending = false;
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot())}\n\n`));
        } catch {
          close();
        }
      };
      const onChange = () => {
        if (pending) return;
        pending = true;
        queueMicrotask(send);
      };
      const unsubscribe = subscribe(onChange);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15_000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      cleanup = close;
      request.signal.addEventListener("abort", close);
      send();
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
