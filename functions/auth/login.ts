// GET /auth/login — redirects to GitHub OAuth. SPEC.md §2.2.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../_lib/env";
import { generateState, stateSetCookie } from "../_lib/session";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const state = generateState();
  const redirectUri = `${context.env.GITHUB_OAUTH_REDIRECT_BASE}/auth/callback`;
  const params = new URLSearchParams({
    client_id: context.env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
    allow_signup: "true",
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://github.com/login/oauth/authorize?${params.toString()}`,
      "Set-Cookie": stateSetCookie(context.request, state),
    },
  });
};
