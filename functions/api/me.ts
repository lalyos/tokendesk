// GET /api/me — current user info. SPEC.md §6.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../_lib/env";
import { isAdmin } from "../_lib/session";
import { getUserAssignedPoolNames, getWindowState } from "../_lib/db";

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const [pools, ws] = await Promise.all([
    getUserAssignedPoolNames(context.env, user.id),
    getWindowState(context.env),
  ]);
  return new Response(
    JSON.stringify({
      gh_user: user.gh_user,
      email: user.email,
      avatar_url: user.avatar_url,
      is_admin: isAdmin(user.gh_user, context.env.ADMIN_GH_USERS),
      pools,
      window_open: ws.is_open,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
