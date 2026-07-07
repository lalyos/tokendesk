// GET /api/token/{pool} — single pool token for the current user. SPEC.md §6, §6.2.
// Auth: session cookie.
//   Default JSON: { "value": "..." }
//   Accept: text/plain -> raw value (the only time the value is exposed via the UI).

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../_lib/env";
import { getUserTokenForPool } from "../../_lib/db";
import { jsonResponse, textResponse, wantsTextPlain } from "../../_lib/respond";
import { isValidPoolName, jsonError } from "../../_lib/validate";

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) {
    return jsonResponse({ error: "unauthenticated" }, 401);
  }
  const name = context.params.pool;
  if (!isValidPoolName(name)) {
    return jsonError(400, "invalid pool name");
  }
  const value = await getUserTokenForPool(context.env, user.id, name);
  if (value === null) {
    return jsonError(404, "no token in this pool for the current user");
  }
  if (wantsTextPlain(context.request)) {
    return textResponse(value);
  }
  return jsonResponse({ value });
};
