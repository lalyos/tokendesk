// Root middleware. Verifies the session cookie and attaches the user to
// context.data. Does NOT gate access — each handler decides. See SPEC.md §2.2 step 4.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "./_lib/env";
import { verifySession } from "./_lib/session";
import { getUserById } from "./_lib/db";

export const onRequest: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const cookieHeader = context.request.headers.get("Cookie") ?? "";
  console.log("[middleware]", {
    method: context.request.method,
    path: new URL(context.request.url).pathname,
    cookieHeaderPresent: cookieHeader.length > 0,
    cookieHeader: cookieHeader.slice(0, 200),
  });
  const userId = await verifySession(context.request, context.env.SESSION_SECRET);
  if (userId !== null) {
    const user = await getUserById(context.env, userId);
    console.log("[middleware] session resolved", {
      userId,
      userFound: !!user,
      gh_user: user?.gh_user,
    });
    if (user) {
      context.data.user = user;
    }
  } else {
    console.log("[middleware] no session");
  }
  return context.next();
};
