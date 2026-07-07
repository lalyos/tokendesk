// Claim logic. SPEC.md §5.
//
// Runs on every login. For each pool, if the user has no assigned token,
// atomically claim the lowest-id free token. Per-pool `UPDATE` so a miss
// in one pool doesn't affect the others.

import type { Env } from "./env";

export interface ClaimResult {
  /** Pool names where the user just got a token. */
  claimed: string[];
  /** Pool names that were skipped (user already had one OR pool was empty). */
  skipped: string[];
}

export async function runClaim(env: Env, userId: number): Promise<ClaimResult> {
  const poolsRes = await env.DB.prepare(
    `SELECT id, name FROM pools ORDER BY id`,
  ).all<{ id: number; name: string }>();
  const pools = poolsRes.results ?? [];
  if (pools.length === 0) return { claimed: [], skipped: [] };

  const now = Date.now();
  const stmts = pools.map((p) =>
    env.DB.prepare(
      // The NOT EXISTS clause is the "user has no token in this pool" gate
      // from SPEC §5. Without it, a user who already has a token in a pool
      // would keep claiming every subsequent free token in that pool.
      `UPDATE pool_tokens
       SET assigned_to_user_id = ?, assigned_at = ?
       WHERE id = (
         SELECT id FROM pool_tokens
         WHERE pool_id = ?
           AND assigned_to_user_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM pool_tokens
             WHERE pool_id = ? AND assigned_to_user_id = ?
           )
         ORDER BY id LIMIT 1
       )`,
    ).bind(userId, now, p.id, p.id, userId),
  );

  const results = await env.DB.batch(stmts);
  const claimed: string[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < pools.length; i++) {
    const p = pools[i]!;
    const r = results[i] as { meta?: { changes?: number } } | undefined;
    const changes = r?.meta?.changes ?? 0;
    if (changes > 0) claimed.push(p.name);
    else skipped.push(p.name);
  }
  return { claimed, skipped };
}
