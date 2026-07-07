// GET    /api/admin/window   — current window state. SPEC.md §4, §6.
// POST   /api/admin/window   — open the window (manual, no timer in v1).
// DELETE /api/admin/window   — close the window.

import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, PagesContextData } from "../../_lib/env";
import { getWindowState, openWindow, closeWindow } from "../../_lib/db";
import { jsonResponse } from "../../_lib/respond";

export const onRequestGet: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const state = await getWindowState(context.env);
  return jsonResponse(state);
};

export const onRequestPost: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const user = context.data.user!;
  const state = await openWindow(context.env, user.id);
  return jsonResponse(state);
};

export const onRequestDelete: PagesFunction<Env, any, PagesContextData> = async (context) => {
  const state = await closeWindow(context.env);
  return jsonResponse(state);
};
