// GET  /api/admin/pools   — list pools with counts. SPEC.md §6.
// POST /api/admin/pools   — create pool with initial token set. SPEC.md §6.
//   body: { name, tokens: ["v1","v2",...] }
//   201 -> { name, total, free, assigned }

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../_lib/env";
import {
  createPool,
  addPoolTokens,
  listPoolSummaries,
  getPoolByName,
} from "../../_lib/db";
import {
  ValidationError,
  jsonError,
  validatePoolName,
  validateTokenValues,
} from "../../_lib/validate";

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const rows = await listPoolSummaries(context.env);
  return new Response(JSON.stringify(rows), {
    headers: { "Content-Type": "application/json" },
  });
};

export const onRequestPost: PagesFunction<Env, any, PagesContextData> = async (context) => {
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return jsonError(400, "body must be a JSON object");
  }
  const { name, tokens } = body as { name?: unknown; tokens?: unknown };
  let poolName: string;
  let tokenValues: string[];
  try {
    poolName = validatePoolName(name);
    tokenValues = validateTokenValues(tokens);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(400, e.message);
    throw e;
  }

  const existing = await getPoolByName(context.env, poolName);
  if (existing) {
    return jsonError(409, `pool '${poolName}' already exists`);
  }

  const pool = await createPool(context.env, poolName);
  await addPoolTokens(context.env, pool.id, tokenValues);

  return new Response(
    JSON.stringify({
      name: pool.name,
      total: tokenValues.length,
      free: tokenValues.length,
      assigned: 0,
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    },
  );
};
