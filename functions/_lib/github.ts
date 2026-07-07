// GitHub OAuth helpers. SPEC.md §2.2.

import type { Env } from "./env";

export interface GhUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string | null;
}

interface GhEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "tokendesk",
};

export async function exchangeCode(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error("[github.exchangeCode] non-2xx", {
      status: res.status,
      body: bodyText.slice(0, 500),
    });
    throw new Error(`github_exchange_http_${res.status}`);
  }
  let data: { access_token?: string; error?: string; error_description?: string };
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`github_exchange_non_json: ${bodyText.slice(0, 200)}`);
  }
  if (!data.access_token) {
    console.error("[github.exchangeCode] no access_token", {
      error: data.error,
      error_description: data.error_description,
      body: bodyText.slice(0, 500),
    });
    const detail = data.error_description || data.error || "no_token";
    throw new Error(`github_exchange_${detail}`);
  }
  return data.access_token;
}

export async function getUser(accessToken: string): Promise<GhUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: { ...GH_HEADERS, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[github.getUser] non-2xx", {
      status: res.status,
      body: body.slice(0, 500),
    });
    throw new Error(`github_user_http_${res.status}`);
  }
  return (await res.json()) as GhUser;
}

export async function getPrimaryEmail(
  accessToken: string,
): Promise<string | null> {
  const res = await fetch("https://api.github.com/user/emails", {
    headers: { ...GH_HEADERS, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[github.getPrimaryEmail] non-2xx", {
      status: res.status,
      body: body.slice(0, 500),
    });
    return null;
  }
  const emails = (await res.json()) as GhEmail[];
  const primary =
    emails.find((e) => e.primary && e.verified) ??
    emails.find((e) => e.verified);
  return primary?.email ?? null;
}
