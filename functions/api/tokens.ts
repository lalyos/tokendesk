// GET /api/tokens — current user's assigned pool tokens. SPEC.md §6, §6.2.
// Auth: session cookie.
//   Default JSON: { "poolname": "value", ... }
//   Accept: text/plain -> "POOLNAME=value\n" lines (eval-friendly for non-dashed names).

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../_lib/env";
import { getUserAssignedTokens } from "../_lib/db";
import { jsonResponse, textResponse, wantsTextPlain } from "../_lib/respond";

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) {
    return jsonResponse({ error: "unauthenticated" }, 401);
  }
  const tokens = await getUserAssignedTokens(context.env, user.id);
  if (wantsTextPlain(context.request)) {
    const body = Object.keys(tokens)
      .sort()
      .map((name) => `${name}=${tokens[name]}`)
      .join("\n");
    return textResponse(body + (body ? "\n" : ""));
  }
  return jsonResponse(tokens);
};
