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

/**
 * Hard-delete a pool and all of its tokens. Returns whether the pool
 * existed and how many token rows were removed. The two DELETEs run as a
 * batch (single round trip); D1 enforces FKs, so the pool_tokens delete
 * must run first.
 */
export async function deletePool(
  env: Env,
  name: string,
): Promise<{ deleted: boolean; tokensDeleted: number }> {
  const pool = await getPoolByName(env, name);
  if (!pool) return { deleted: false, tokensDeleted: 0 };
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM pool_tokens WHERE pool_id = ?`).bind(pool.id),
    env.DB.prepare(`DELETE FROM pools WHERE id = ?`).bind(pool.id),
  ]);
  const tokensDeleted =
    (results[0] as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0;
  return { deleted: true, tokensDeleted };
}

// --- user-side: tokens assigned to a user ---

export async function getUserAssignedPoolNames(
  env: Env,
  userId: number,
): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT p.name AS name
     FROM pool_tokens t
     JOIN pools p ON p.id = t.pool_id
     WHERE t.assigned_to_user_id = ?
     ORDER BY p.name`,
  )
    .bind(userId)
    .all<{ name: string }>();
  return (rows.results ?? []).map((r) => r.name);
}

export async function getUserAssignedTokens(
  env: Env,
  userId: number,
): Promise<Record<string, string>> {
  const rows = await env.DB.prepare(
    `SELECT p.name AS name, t.value AS value
     FROM pool_tokens t
     JOIN pools p ON p.id = t.pool_id
     WHERE t.assigned_to_user_id = ?
     ORDER BY p.name`,
  )
    .bind(userId)
    .all<{ name: string; value: string }>();
  const out: Record<string, string> = {};
  for (const r of rows.results ?? []) out[r.name] = r.value;
  return out;
}

export async function getUserTokenForPool(
  env: Env,
  userId: number,
  poolName: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT t.value AS value
     FROM pool_tokens t
     JOIN pools p ON p.id = t.pool_id
     WHERE t.assigned_to_user_id = ? AND p.name = ?
     LIMIT 1`,
  )
    .bind(userId, poolName)
    .first<{ value: string }>();
  return row?.value ?? null;
}

// --- machine tokens ---

export interface MachineToken {
  token: string;
  created_at: number;
  rotated_at: number | null;
}

export async function getMachineToken(
  env: Env,
  userId: number,
): Promise<MachineToken | null> {
  const row = await env.DB.prepare(
    `SELECT token, created_at, rotated_at
     FROM machine_tokens WHERE user_id = ?`,
  )
    .bind(userId)
    .first<MachineToken>();
  return row ?? null;
}

export async function getUserIdByMachineToken(
  env: Env,
  token: string,
): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT user_id FROM machine_tokens WHERE token = ?`,
  )
    .bind(token)
    .first<{ user_id: number }>();
  return row?.user_id ?? null;
}

function generateMachineTokenValue(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `td_pat_${hex}`;
}

/**
 * Create or rotate the user's machine token. Returns the plaintext + meta.
 * SPEC.md §6.1 — the `token` field is the only time the plaintext is exposed.
 */
export async function upsertMachineToken(
  env: Env,
  userId: number,
): Promise<MachineToken> {
  const now = Date.now();
  const token = generateMachineTokenValue();
  const row = await env.DB.prepare(
    `INSERT INTO machine_tokens (user_id, token, created_at, rotated_at)
     VALUES (?, ?, ?, NULL)
     ON CONFLICT(user_id) DO UPDATE SET
       token = excluded.token,
       rotated_at = excluded.created_at
     RETURNING token, created_at, rotated_at`,
  )
    .bind(userId, token, now)
    .first<MachineToken>();
  if (!row) throw new Error("upsertMachineToken returned no row");
  return row;
}

// --- claim window state ---

export interface WindowState {
  is_open: boolean;
  opened_by: string | null;  // gh_user
  opened_at: number | null;
}

export async function getWindowState(env: Env): Promise<WindowState> {
  const row = await env.DB.prepare(
    `SELECT ws.is_open     AS is_open,
            ws.opened_at   AS opened_at,
            u.gh_user      AS opened_by
     FROM window_state ws
     LEFT JOIN users u ON u.id = ws.opened_by_user_id
     WHERE ws.id = 1`,
  ).first<{ is_open: number; opened_by: string | null; opened_at: number | null }>();
  if (!row) return { is_open: false, opened_by: null, opened_at: null };
  return {
    is_open: row.is_open === 1,
    opened_by: row.opened_by,
    opened_at: row.opened_at,
  };
}

export async function openWindow(env: Env, userId: number): Promise<WindowState> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO window_state (id, is_open, opened_by_user_id, opened_at)
     VALUES (1, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       is_open = 1,
       opened_by_user_id = excluded.opened_by_user_id,
       opened_at = excluded.opened_at`,
  )
    .bind(userId, now)
    .run();
  return getWindowState(env);
}

export async function closeWindow(env: Env): Promise<WindowState> {
  await env.DB.prepare(
    `UPDATE window_state
     SET is_open = 0, opened_by_user_id = NULL, opened_at = NULL
     WHERE id = 1`,
  ).run();
  return { is_open: false, opened_by: null, opened_at: null };
}


