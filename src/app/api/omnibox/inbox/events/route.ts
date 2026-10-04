import { createClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function encodeEvent(payload: Record<string, unknown>) {
  return `event: inbox\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId =
    !claimsError && typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1);

  if (
    membershipError ||
    !Array.isArray(memberships) ||
    memberships.length !== 1
  ) {
    return new Response("Organization membership required", { status: 403 });
  }

  const organizationId = String(memberships[0].organization_id);
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? "";

  if (!accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  await supabase.realtime.setAuth(accessToken);

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(payload)));
        } catch {
          closed = true;
        }
      };

      channel = supabase
        .channel(`omnibox-inbox-${organizationId}-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            send({
              type: "message",
              conversationId: row.conversation_id ?? null,
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const row = (payload.new || payload.old) as Record<string, unknown>;
            send({
              type: "conversation",
              conversationId: row.id ?? null,
            });
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            send({ type: "ready" });
          }
        });

      heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            closed = true;
          }
        }
      }, 20_000);

      request.signal.addEventListener(
        "abort",
        () => {
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          if (channel) void supabase.removeChannel(channel);
          try {
            controller.close();
          } catch {}
        },
        { once: true },
      );
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (channel) void supabase.removeChannel(channel);
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
