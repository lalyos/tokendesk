// GET  /api/me/machine-token  — meta only (existence + timestamps, no plaintext).
// POST /api/me/machine-token  — create or rotate. Returns the plaintext ONCE.
//   SPEC.md §6.1.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../_lib/env";
import { getMachineToken, upsertMachineToken } from "../../_lib/db";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthenticated" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) return unauthorized();
  const mt = await getMachineToken(context.env, user.id);
  if (!mt) {
    return new Response(
      JSON.stringify({ exists: false, created_at: null, rotated_at: null }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({
      exists: true,
      created_at: mt.created_at,
      rotated_at: mt.rotated_at,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};

export const onRequestPost: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user;
  if (!user) return unauthorized();
  const mt = await upsertMachineToken(context.env, user.id);
  return new Response(JSON.stringify(mt), {
    headers: { "Content-Type": "application/json" },
  });
};
