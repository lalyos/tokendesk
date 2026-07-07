// D1 helpers. SPEC.md §3.

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
