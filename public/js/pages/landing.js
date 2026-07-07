// Landing page. SPEC.md §7.1 "/" — login button or "logged in as X".
// Reuses the global `me` populated by app.js so we don't double-fetch /api/me.

export const Landing = {
  view: () => {
    const me = window.__td_me ? window.__td_me() : null;
    const err = new URL(window.location.href).searchParams.get("error");
    if (me) {
      return m("main.hero", [
        m("h1", "TokenDesk"),
        m("p.lede", [
          "Logged in as ",
          m("strong", me.gh_user),
          me.is_admin ? m("span.badge", "admin") : null,
        ]),
        me.email ? m("p.muted.small", me.email) : null,
        me.is_admin
          ? m("p", m("a.btn", { href: "#/admin/pools" }, "Manage pools"))
          : null,
        m("form", { method: "post", action: "/auth/logout" }, [
          m("button.btn", { type: "submit" }, "Logout"),
        ]),
        err ? m("p.error", `Error: ${err}`) : null,
      ]);
    }
    return m("main.hero", [
      m("h1", "TokenDesk"),
      m("p.lede", "Sign in with GitHub to claim tokens from admin-opened pools."),
      m("a.btn.btn-primary", { href: "/auth/login" }, "Login with GitHub"),
      err ? m("p.error", `Error: ${err}`) : null,
    ]);
  },
};
