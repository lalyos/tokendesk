// GET /auth/callback — exchanges code, upserts user, sets session cookie.
// Redirects to / for now (SPEC says /tokens, but the SPA isn't built yet).
// Claim logic is intentionally out of scope here — no pools, no KV.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../_lib/env";
import {
  readCookie,
  signSession,
  sessionSetCookie,
  stateClearCookie,
  STATE_COOKIE,
} from "../_lib/session";
import { exchangeCode, getUser, getPrimaryEmail } from "../_lib/github";
import { upsertUser } from "../_lib/db";

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const stateCookie = readCookie(context.request, STATE_COOKIE);

  if (!code || !stateParam || !stateCookie || stateParam !== stateCookie) {
    return Response.redirect(
      new URL("/?error=invalid_oauth_state", context.request.url).toString(),
      302,
    );
  }

  try {
    const redirectUri = `${context.env.GITHUB_OAUTH_REDIRECT_BASE}/auth/callback`;
    const accessToken = await exchangeCode(context.env, code, redirectUri);
    const ghUser = await getUser(accessToken);
    const email = ghUser.email ?? (await getPrimaryEmail(accessToken));
    const user = await upsertUser(context.env, {
      gh_id: ghUser.id,
      gh_user: ghUser.login,
      email,
      avatar_url: ghUser.avatar_url,
    });
    const sessionValue = await signSession(
      context.request,
      user.id,
      context.env.SESSION_SECRET,
    );
    const headers = new Headers();
    headers.set("Location", "/");
    headers.append("Set-Cookie", sessionSetCookie(context.request, sessionValue));
    headers.append("Set-Cookie", stateClearCookie(context.request));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "auth_failed";
    return Response.redirect(
      new URL(`/?error=${encodeURIComponent(msg)}`, context.request.url).toString(),
      302,
    );
  }
};
