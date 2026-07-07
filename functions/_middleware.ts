// Root middleware. Verifies the session cookie and attaches the user to
// context.data. Does NOT gate access — each handler decides. See SPEC.md §2.2 step 4.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "./_lib/env";
import { verifySession } from "./_lib/session";
import { getUserById } from "./_lib/db";

export const onRequest: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const userId = await verifySession(context.request, context.env.SESSION_SECRET);
  if (userId !== null) {
    const user = await getUserById(context.env, userId);
    if (user) {
      context.data.user = user;
    }
  }
  return context.next();
};
