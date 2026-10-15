import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retained only to provide a safe response for older MatoMeet clients.
// All X DM and X Chat API operations are retired. Publishing is unaffected.
Deno.serve((request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(JSON.stringify({ ok: false, error: "x_messaging_disabled" }), {
    status: 410,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
});
