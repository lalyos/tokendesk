// POST /auth/logout — clears the session cookie. SPEC.md §2.2.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../_lib/env";
import { sessionClearCookie } from "../_lib/session";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": sessionClearCookie(context.request),
    },
  });
};
