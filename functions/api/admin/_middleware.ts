// Admin gate. Gates every /api/admin/* route. SPEC.md §2.4, §6.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../_lib/env";
import { isAdmin } from "../../_lib/session";

export const onRequest: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!isAdmin(user.gh_user, context.env.ADMIN_GH_USERS)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return context.next();
};
