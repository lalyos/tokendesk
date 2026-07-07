// GET /api/token/{pool} — single pool token for the current user. SPEC.md §6, §6.2.
// Auth: session cookie or Bearer (td_pat_...).
//   Default (no Accept or Accept: */*): plain text (the raw value).
//     Convenient for shell scripts:  TOKEN=$(curl .../api/token/openrouter)
//   Accept: application/json        -> { "value": "..." }
//
// Compare /api/tokens (plural) which defaults to JSON because it returns
// a structured object.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../_lib/env";
import { getUserTokenForPool } from "../../_lib/db";
import { jsonResponse, textResponse, wantsJson } from "../../_lib/respond";
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
  if (wantsJson(context.request)) {
    return jsonResponse({ value });
  }
  return textResponse(value);
};
