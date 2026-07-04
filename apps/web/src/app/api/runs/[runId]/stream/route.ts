import * as runBus from "@/lib/run-bus";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { runId } = await params;
  const encoder = new TextEncoder();

  console.log(`[sse] new connection for runId=${runId}`);

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Client disconnected
        }
      };

      // Use a mutable ref so the handler can safely call unsubscribe even when
      // invoked synchronously during buffer replay (before the const is assigned).
      let doUnsubscribe = () => {};

      const close = () => {
        doUnsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };

      const unsubscribe = runBus.subscribe(runId, (event) => {
        console.log(`[sse] sending event ${event.type} to runId=${runId}`);
        send(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === "run_completed" || event.type === "run_error") {
          close();
        }
      });

      // Point the mutable ref at the real unsubscribe now that subscribe() has returned.
      doUnsubscribe = unsubscribe;

      req.signal.addEventListener("abort", close);

      // SSE heartbeat comment (browsers ignore comment lines; it just keeps the connection alive)
      send(": connected\n\n");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
