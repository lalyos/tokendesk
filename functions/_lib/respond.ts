// Response helpers + content negotiation. SPEC.md §6.2.

export function wantsTextPlain(request: Request): boolean {
  const accept = request.headers.get("Accept") ?? "";
  // Default: JSON. text/plain is only honoured if it appears AND neither
  // application/json nor */* are present.
  if (accept.includes("application/json")) return false;
  if (accept.includes("*/*")) return false;
  return accept.toLowerCase().includes("text/plain");
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
