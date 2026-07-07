// Session + state cookie helpers. SPEC.md §2.3.
// Session cookie value: <user_id>.<hmac_sha256(user_id, SESSION_SECRET)>
// State cookie: short-lived random string for CSRF.

const SESSION_COOKIE = "td_session";
const STATE_COOKIE = "td_oauth_state";
const STATE_MAX_AGE = 600; // 10 minutes

function base64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return base64urlEncode(new Uint8Array(sig));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function isLocal(request: Request): boolean {
  const h = new URL(request.url).hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function baseAttrs(request: Request): string {
  const secure = isLocal(request) ? "" : "; Secure";
  return `HttpOnly; SameSite=Lax; Path=/${secure}`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return null;
}

export async function signSession(
  request: Request,
  userId: number,
  secret: string,
): Promise<string> {
  const mac = await hmac(secret, String(userId));
  return `${userId}.${mac}`;
}

export async function verifySession(
  request: Request,
  secret: string,
): Promise<number | null> {
  const cookie = readCookie(request, SESSION_COOKIE);
  if (!cookie) return null;
  const dot = cookie.indexOf(".");
  if (dot < 0) return null;
  const userIdStr = cookie.slice(0, dot);
  const mac = cookie.slice(dot + 1);
  const expected = await hmac(secret, userIdStr);
  if (!constantTimeEqual(mac, expected)) return null;
  const id = Number(userIdStr);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export function sessionSetCookie(request: Request, value: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}${baseAttrs(request)}`;
}

export function sessionClearCookie(request: Request): string {
  return `${SESSION_COOKIE}=; ${baseAttrs(request)}; Max-Age=0`;
}

export function stateSetCookie(request: Request, value: string): string {
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; ${baseAttrs(request)}; Max-Age=${STATE_MAX_AGE}`;
}

export function stateClearCookie(request: Request): string {
  return `${STATE_COOKIE}=; ${baseAttrs(request)}; Max-Age=0`;
}

export function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

export function isAdmin(ghUser: string, adminUsers: string | undefined): boolean {
  if (!adminUsers) return false;
  return adminUsers
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(ghUser);
}

export { SESSION_COOKIE, STATE_COOKIE };
