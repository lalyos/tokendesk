// Fetch wrapper. Default Accept: application/json, includes cookies, parses JSON.
// On 401, redirect to "/" (login page) and reload. On other errors, throws.

export async function apiGet(path) {
  const res = await fetch(path, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  return handle(res, "GET", path);
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res, "POST", path);
}

export async function apiSend(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res, method, path);
}

async function handle(res, method, path) {
  if (res.status === 401) {
    // Lost session — bounce to landing only if we're on a protected
    // (hash-routed) page. On "/" the SPA renders the login button when
    // me is null, so a redirect would cause an infinite reload loop.
    if (window.location.hash) {
      window.location.href = "/";
    }
    throw new ApiError(401, "unauthenticated");
  }
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }
  if (!res.ok) {
    const msg = (body && body.error) || `${method} ${path} -> ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return body;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Tokens come from a textarea (one per line). Trim, drop blanks, dedupe.
export function parseTokenList(text) {
  const out = [];
  const seen = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const v = raw.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
