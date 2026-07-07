// Admin dashboard. SPEC.md §7.1 "/admin".
//   - claim window controls (open / close / current state)
//   - quick links to sub-pages
//
// Window is manual in v1 (no auto-close timer).

import { apiGet, apiSend } from "../lib/api.js";

export const AdminDashboard = {
  oninit: async (vnode) => {
    vnode.state.loading = true;
    vnode.state.error = null;
    vnode.state.flash = null;
    vnode.state.window = null;       // { is_open, opened_by, opened_at }
    vnode.state.busy = false;
    await refresh(vnode);
  },
  view: (vnode) =>
    m("main.container", [
      m("h1", "Admin"),
      vnode.state.error ? m("p.error", vnode.state.error) : null,
      vnode.state.flash ? m("p.ok", vnode.state.flash) : null,
      m(WindowCard, { vnode }),
      m(LinksCard),
    ]),
};

async function refresh(vnode) {
  vnode.state.loading = true;
  vnode.state.error = null;
  try {
    vnode.state.window = await apiGet("/api/admin/window");
  } catch (e) {
    vnode.state.error = e instanceof Error ? e.message : String(e);
  }
  vnode.state.loading = false;
  m.redraw();
}

function fmtTime(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

const WindowCard = {
  view: (vnode) => {
    const s = vnode.attrs.vnode.state;
    const w = s.window;
    const setWindow = async (verb) => {
      s.busy = true;
      s.error = null;
      try {
        s.window = await apiSend(verb, "/api/admin/window", verb === "POST" ? {} : undefined);
        s.flash =
          verb === "POST"
            ? "Claim window opened. Users can now log in to claim."
            : "Claim window closed.";
      } catch (e) {
        s.error = e instanceof Error ? e.message : String(e);
      } finally {
        s.busy = false;
        m.redraw();
      }
    };
    if (s.loading && !w) {
      return m("section.card", m("p.muted", "Loading..."));
    }
    return m("section.card", [
      m("h2", "Claim window"),
      w?.is_open
        ? m("p", [m("strong.ok-text", "OPEN"), " — users logging in will claim a free token from each pool."])
        : m("p", [m("strong", "Closed"), " — new logins will not claim tokens."]),
      m("dl.meta", [
        m("dt", "Opened by"),
        m("dd", w?.opened_by ?? "—"),
        m("dt", "Opened at"),
        m("dd", fmtTime(w?.opened_at)),
      ]),
      m("div.row", [
        w?.is_open
          ? m(
              "button.btn",
              { type: "button", disabled: s.busy, onclick: () => setWindow("DELETE") },
              s.busy ? "Closing..." : "Close window",
            )
          : m(
              "button.btn.btn-primary",
              { type: "button", disabled: s.busy, onclick: () => setWindow("POST") },
              s.busy ? "Opening..." : "Open window",
            ),
      ]),
    ]);
  },
};

const LinksCard = {
  view: () =>
    m("section.card", [
      m("h2", "Quick links"),
      m("ul.links", [
        m("li", m("a", { href: "#/admin/pools" }, "Manage pools")),
      ]),
    ]),
};
