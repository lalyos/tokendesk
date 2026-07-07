// GET  /api/admin/pools/{name}  — pool detail incl. all tokens. SPEC.md §6.
// POST /api/admin/pools/{name}  — append tokens to an existing pool. SPEC.md §6.
//   body: { tokens: ["v1","v2",...] }
//   200 -> { name, total, free, assigned }

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../../_lib/env";
import { addPoolTokens, getPoolByName, getPoolDetail } from "../../../_lib/db";
import {
  ValidationError,
  jsonError,
  isValidPoolName,
  validateTokenValues,
} from "../../../_lib/validate";

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const name = context.params.name;
  if (!isValidPoolName(name)) {
    return jsonError(400, "invalid pool name");
  }
  const detail = await getPoolDetail(context.env, name);
  if (!detail) return jsonError(404, "pool not found");
  return new Response(JSON.stringify(detail), {
    headers: { "Content-Type": "application/json" },
  });
};

export const onRequestPost: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const name = context.params.name;
  if (!isValidPoolName(name)) {
    return jsonError(400, "invalid pool name");
  }
  const pool = await getPoolByName(context.env, name);
  if (!pool) return jsonError(404, "pool not found");

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return jsonError(400, "body must be a JSON object");
  }
  const { tokens } = body as { tokens?: unknown };
  let tokenValues: string[];
  try {
    tokenValues = validateTokenValues(tokens);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(400, e.message);
    throw e;
  }

  await addPoolTokens(context.env, pool.id, tokenValues);

  const detail = await getPoolDetail(context.env, name);
  return new Response(JSON.stringify(detail), {
    headers: { "Content-Type": "application/json" },
  });
};
