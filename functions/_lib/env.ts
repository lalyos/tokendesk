// Shared types for Pages Functions. See SPEC.md §2, §3, §6.

export interface User {
  id: number;
  gh_user: string;
  gh_id: number;
  email: string | null;
  avatar_url: string | null;
  created_at: number;
}

export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ADMIN_GH_USERS: string;
  GITHUB_OAUTH_REDIRECT_BASE: string;
  // WINDOW binding is added when the claim window lands (SPEC §4).
  WINDOW?: KVNamespace;
}

export interface PagesContextData {
  user?: User;
  authMethod?: "cookie" | "bearer";
  [key: string]: unknown;
}
