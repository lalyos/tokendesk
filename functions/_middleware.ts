// Root middleware. Tries the session cookie first, then the Authorization
// Bearer header, and attaches the user to context.data. Tracks the auth
// method so per-handler code can require cookie-only (e.g. API key
// rotation). Does NOT gate access — each handler decides.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "./_lib/env";
import { verifySession, extractBearer } from "./_lib/session";
import { getUserById, getUserIdByApiKey } from "./_lib/db";

export const onRequest: PagesFunction<Env, any, PagesContextData> = async (context) => {
  let userId = await verifySession(context.request, context.env.SESSION_SECRET);

  if (userId === null) {
    const bearer = extractBearer(context.request);
    if (bearer) {
      userId = await getUserIdByApiKey(context.env, bearer);
      if (userId !== null) {
        context.data.authMethod = "bearer";
      }
    }
  } else {
    context.data.authMethod = "cookie";
  }

  if (userId !== null) {
    const user = await getUserById(context.env, userId);
    if (user) {
      context.data.user = user;
    } else {
      // Token pointed at a deleted user. Treat as unauthenticated.
      delete context.data.authMethod;
    }
  }
  return context.next();
};
