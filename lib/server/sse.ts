/**
 * Server-Sent Events helper: pushes a fresh snapshot whenever the subscription
 * fires (coalesced per tick), with a heartbeat to keep proxies from idling out.
 */
export function sseResponse(
  request: Request,
  subscribe: (onChange: () => void) => () => void,
  snapshot: () => unknown,
): Response {
  return sseMessages(request, (push) => {
    let pending = false;
    const send = () => {
      pending = false;
      push(snapshot());
    };
    const unsubscribe = subscribe(() => {
      if (pending) return;
      pending = true;
      queueMicrotask(send);
    });
    send();
    return unsubscribe;
  });
}

/**
 * Server-Sent Events helper for a stream of discrete messages (each one is
 * delivered, nothing is coalesced). Used by the WebRTC signalling relay.
 */
export function sseMessages(request: Request, start: (push: (message: unknown) => void) => () => void): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      const push = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };
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
      unsubscribe = start(push);
      if (closed) unsubscribe();
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
