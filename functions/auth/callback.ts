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

  console.log("[auth/callback] entry", {
    hasCode: !!code,
    hasStateParam: !!stateParam,
    hasStateCookie: !!stateCookie,
    stateMatches: !!stateParam && !!stateCookie && stateParam === stateCookie,
    codePrefix: code ? code.slice(0, 6) : null,
    codeLen: code?.length ?? 0,
    env: {
      hasClientId: !!context.env.GITHUB_CLIENT_ID,
      hasClientSecret: !!context.env.GITHUB_CLIENT_SECRET,
      hasSessionSecret: !!context.env.SESSION_SECRET,
      redirectBase: context.env.GITHUB_OAUTH_REDIRECT_BASE,
    },
  });

  if (!code || !stateParam || !stateCookie || stateParam !== stateCookie) {
    console.warn("[auth/callback] invalid state, redirecting to /?error=invalid_oauth_state");
    return Response.redirect(
      new URL("/?error=invalid_oauth_state", context.request.url).toString(),
      302,
    );
  }

  try {
    const redirectUri = `${context.env.GITHUB_OAUTH_REDIRECT_BASE}/auth/callback`;
    console.log("[auth/callback] step 1: exchangeCode", { redirectUri });
    const accessToken = await exchangeCode(context.env, code, redirectUri);
    console.log("[auth/callback] step 1 ok: got access_token", {
      tokenPrefix: accessToken.slice(0, 6),
      tokenLen: accessToken.length,
    });

    console.log("[auth/callback] step 2: getUser");
    const ghUser = await getUser(accessToken);
    console.log("[auth/callback] step 2 ok: getUser", {
      login: ghUser.login,
      id: ghUser.id,
      hasEmail: !!ghUser.email,
    });

    let email = ghUser.email;
    if (!email) {
      console.log("[auth/callback] step 3: getPrimaryEmail (ghUser.email was null)");
      email = await getPrimaryEmail(accessToken);
      console.log("[auth/callback] step 3 ok: getPrimaryEmail", { email });
    }

    console.log("[auth/callback] step 4: upsertUser", {
      gh_id: ghUser.id,
      gh_user: ghUser.login,
      email,
    });
    const user = await upsertUser(context.env, {
      gh_id: ghUser.id,
      gh_user: ghUser.login,
      email,
      avatar_url: ghUser.avatar_url,
    });
    console.log("[auth/callback] step 4 ok: upsertUser", {
      id: user.id,
      gh_user: user.gh_user,
    });

    const sessionValue = await signSession(
      context.request,
      user.id,
      context.env.SESSION_SECRET,
    );
    console.log("[auth/callback] signing session", {
      userId: user.id,
      sessionValuePrefix: sessionValue.slice(0, 40),
    });
    const sessionCookie = sessionSetCookie(context.request, sessionValue);
    const stateCookieClear = stateClearCookie(context.request);
    console.log("[auth/callback] Set-Cookie headers", {
      session: sessionCookie,
      stateClear: stateCookieClear,
    });
    const headers = new Headers();
    headers.set("Location", "/");
    headers.append("Set-Cookie", sessionCookie);
    headers.append("Set-Cookie", stateCookieClear);
    console.log("[auth/callback] success, redirecting to /", { userId: user.id });
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "auth_failed";
    console.error("[auth/callback] FAILED:", err);
    return Response.redirect(
      new URL(`/?error=${encodeURIComponent(msg)}`, context.request.url).toString(),
      302,
    );
  }
};
