// SPA entrypoint. Wires m.route with a shared Layout (header + main).
// Mithril is loaded from the CDN as a global. The Mithril script tag in
// index.html has `defer`, so by the time this module runs `m` is defined.

import { Landing } from "./pages/landing.js";
import { Tokens } from "./pages/tokens.js";
import { AdminPools } from "./pages/admin-pools.js";
import { apiGet } from "./lib/api.js";

// One global "me" — fetched once on page load, updated on login/logout.
const me = { current: null, loaded: false };

// Expose a getter to other components (Landing reads it instead of re-fetching).
window.__td_me = () => me.current;

async function loadMe() {
  try {
    me.current = await apiGet("/api/me");
  } catch {
    me.current = null;
  }
  me.loaded = true;
}

// Layout: header (nav + logout) + routed page content.
const Layout = {
  view: (vnode) =>
    m(".app", [
      m(Header),
      m("main", vnode.children),
    ]),
};

const Header = {
  view: () => {
    const u = me.current;
    return m("header.topbar", [
      m("a.brand", { href: "#/" }, "TokenDesk"),
      m("nav", [
        u ? m("a", { href: "#/tokens" }, "Tokens") : null,
        u && u.is_admin ? m("a", { href: "#/admin/pools" }, "Pools") : null,
      ]),
      m("div.right", [
        u
          ? m("span.user", [
              u.is_admin ? m("span.badge", "admin") : null,
              " ",
              m("strong", u.gh_user),
            ])
          : null,
        u
          ? m("form.inline", { method: "post", action: "/auth/logout" }, [
              m("button.btn.small", { type: "submit" }, "Logout"),
            ])
          : m("a.btn.small.btn-primary", { href: "/auth/login" }, "Login with GitHub"),
      ]),
    ]);
  },
};

// Wrap a page component in Layout.
const wrap = (Page) => ({
  view: (vnode) => m(Layout, m(Page, vnode.attrs)),
});

await loadMe();
m.route(document.getElementById("app"), "/", {
  "/": wrap(Landing),
  "/tokens": wrap(Tokens),
  "/admin/pools": wrap(AdminPools),
});
