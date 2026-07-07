// GET  /api/me/api-key  — meta only (existence + timestamps, no plaintext).
// POST /api/me/api-key  — create or rotate. Returns the plaintext ONCE.
//   SPEC.md §6.1.
//
// Both endpoints are UI-only (cookie auth). A Bearer caller (CI/script) cannot
// create or rotate its own key: that's a chicken-egg problem (you'd need the
// old key to mint a new one, and CI/script callers only ever have the
// plaintext shown once by the UI).

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../_lib/env";
import { getApiKey, upsertApiKey } from "../../_lib/db";
import { jsonResponse } from "../../_lib/respond";

function reject(requestType: "unauth" | "bearer", status: 401 | 403) {
  const msg =
    requestType === "unauth"
      ? "unauthenticated"
      : "API key endpoints require a browser session (cookie)";
  return jsonResponse({ error: msg }, status);
}

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) return reject("unauth", 401);
  if (context.data.authMethod !== "cookie") return reject("bearer", 403);
  const k = await getApiKey(context.env, user.id);
  if (!k) {
    return jsonResponse({ exists: false, created_at: null, rotated_at: null });
  }
  return jsonResponse({
    exists: true,
    created_at: k.created_at,
    rotated_at: k.rotated_at,
  });
};

export const onRequestPost: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) return reject("unauth", 401);
  if (context.data.authMethod !== "cookie") return reject("bearer", 403);
  const k = await upsertApiKey(context.env, user.id);
  return jsonResponse(k);
};
