// GET  /api/me/machine-token  — meta only (existence + timestamps, no plaintext).
// POST /api/me/machine-token  — create or rotate. Returns the plaintext ONCE.
//   SPEC.md §6.1.
//
// Both endpoints are UI-only (cookie auth). A Bearer caller (CI/script) cannot
// create or rotate its own token: that's a chicken-egg problem (you'd need the
// old token to mint a new one, and CI/script callers only ever have the
// plaintext shown once by the UI).

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../_lib/env";
import { getMachineToken, upsertMachineToken } from "../../_lib/db";
import { jsonResponse } from "../../_lib/respond";

function reject(requestType: "unauth" | "bearer", status: 401 | 403) {
  const msg =
    requestType === "unauth"
      ? "unauthenticated"
      : "machine-token endpoints require a browser session (cookie)";
  return jsonResponse({ error: msg }, status);
}

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) return reject("unauth", 401);
  if (context.data.authMethod !== "cookie") return reject("bearer", 403);
  const mt = await getMachineToken(context.env, user.id);
  if (!mt) {
    return jsonResponse({ exists: false, created_at: null, rotated_at: null });
  }
  return jsonResponse({
    exists: true,
    created_at: mt.created_at,
    rotated_at: mt.rotated_at,
  });
};

export const onRequestPost: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) return reject("unauth", 401);
  if (context.data.authMethod !== "cookie") return reject("bearer", 403);
  const mt = await upsertMachineToken(context.env, user.id);
  return jsonResponse(mt);
};
