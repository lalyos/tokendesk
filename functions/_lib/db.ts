// D1 helpers. SPEC.md §3, §6.

import type { Env, User } from "./env";

export async function upsertUser(
  env: Env,
  data: {
    gh_id: number;
    gh_user: string;
    email: string | null;
    avatar_url: string | null;
  },
): Promise<User> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO users (gh_user, gh_id, email, avatar_url, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(gh_id) DO UPDATE SET
       gh_user = excluded.gh_user,
       email = excluded.email,
       avatar_url = excluded.avatar_url
     RETURNING *`,
  )
    .bind(data.gh_user, data.gh_id, data.email, data.avatar_url, now)
    .first<User>();
  if (!row) throw new Error("upsertUser returned no row");
  return row;
}

export async function getUserById(env: Env, id: number): Promise<User | null> {
  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(id)
    .first<User>();
  return row ?? null;
}

// --- pools ---

export interface PoolSummary {
  name: string;
  total: number;
  free: number;
  assigned: number;
}

export interface PoolTokenRow {
  id: number;
  value: string;
  assigned_to: string | null;
}

export interface PoolDetail extends PoolSummary {
  tokens: PoolTokenRow[];
}

export async function getPoolByName(
  env: Env,
  name: string,
): Promise<{ id: number; name: string; created_at: number } | null> {
  return await env.DB.prepare(
    `SELECT id, name, created_at FROM pools WHERE name = ?`,
  )
    .bind(name)
    .first<{ id: number; name: string; created_at: number }>();
}

export async function createPool(
  env: Env,
  name: string,
): Promise<{ id: number; name: string; created_at: number }> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO pools (name, created_at) VALUES (?, ?) RETURNING id, name, created_at`,
  )
    .bind(name, now)
    .first<{ id: number; name: string; created_at: number }>();
  if (!row) throw new Error("createPool returned no row");
  return row;
}

/**
 * Batch-insert N tokens for a pool. Returns the inserted count.
 * Uses one statement per token; D1 runs them as a batch (single round trip).
 */
export async function addPoolTokens(
  env: Env,
  poolId: number,
  values: string[],
): Promise<number> {
  if (values.length === 0) return 0;
  const now = Date.now();
  const stmts = values.map((v) =>
    env.DB.prepare(
      `INSERT INTO pool_tokens (pool_id, value, created_at) VALUES (?, ?, ?)`,
    ).bind(poolId, v, now),
  );
  const results = await env.DB.batch(stmts);
  // D1 returns the number of rows affected per statement as `meta.rows_written`
  // for some bindings; the array length is the success signal in practice.
  return results.length;
}

export async function listPoolSummaries(env: Env): Promise<PoolSummary[]> {
  const rows = await env.DB.prepare(
    `SELECT
       p.name AS name,
       COUNT(t.id) AS total,
       SUM(CASE WHEN t.assigned_to_user_id IS NULL THEN 1 ELSE 0 END) AS free,
       SUM(CASE WHEN t.assigned_to_user_id IS NOT NULL THEN 1 ELSE 0 END) AS assigned
     FROM pools p
     LEFT JOIN pool_tokens t ON t.pool_id = p.id
     GROUP BY p.id, p.name
     ORDER BY p.name`,
  ).all<PoolSummary>();
  return (rows.results ?? []).map((r) => ({
    name: r.name,
    total: r.total ?? 0,
    free: r.free ?? 0,
    assigned: r.assigned ?? 0,
  }));
}

export async function getPoolDetail(
  env: Env,
  name: string,
): Promise<PoolDetail | null> {
  const pool = await getPoolByName(env, name);
  if (!pool) return null;
  const tokens = await env.DB.prepare(
    `SELECT t.id            AS id,
            t.value         AS value,
            u.gh_user       AS assigned_to
     FROM pool_tokens t
     LEFT JOIN users u ON u.id = t.assigned_to_user_id
     WHERE t.pool_id = ?
     ORDER BY t.id`,
  )
    .bind(pool.id)
    .all<PoolTokenRow>();
  const list = tokens.results ?? [];
  const free = list.filter((t) => t.assigned_to === null).length;
  return {
    name: pool.name,
    total: list.length,
    free,
    assigned: list.length - free,
    tokens: list,
  };
}

