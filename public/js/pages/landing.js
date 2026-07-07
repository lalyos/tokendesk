// Landing page. SPEC.md §7.1 "/" — login button or "logged in as X".
// Shows the claim-window state (from the global `me`) and a "claimed" banner
// when /auth/callback redirected with ?claimed=pool1,pool2.

export const Landing = {
  view: () => {
    const me = window.__td_me ? window.__td_me() : null;
    const url = new URL(window.location.href);
    const err = url.searchParams.get("error");
    const claimedParam = url.searchParams.get("claimed");
    const claimed = claimedParam ? claimedParam.split(",").filter(Boolean) : [];
    if (me) {
      return m("main.container", [
        m("h1", "TokenDesk"),
        m(WindowBanner, { windowOpen: !!me.window_open }),
        claimed.length > 0
          ? m("p.ok", [
              "Claimed tokens from: ",
              m(ClaimedList, { claimed }),
              ". They are now visible on ",
              m("a", { href: "#/tokens" }, "My tokens"),
              ".",
            ])
          : null,
        m("p.lede", [
          "Logged in as ",
          m("strong", me.gh_user),
          me.is_admin ? m("span.badge", "admin") : null,
        ]),
        me.email ? m("p.muted.small", me.email) : null,
        m("p", [
          m("a.btn", { href: "#/tokens" }, "My tokens"),
          " ",
          me.is_admin
            ? m("a.btn", { href: "#/admin" }, "Admin")
            : null,
        ]),
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

const WindowBanner = {
  view: (vnode) =>
    vnode.attrs.windowOpen
      ? m("p.ok", "Claim window is currently OPEN. Logging in will claim free tokens from every pool.")
      : m("p.muted", "Claim window is currently closed. New logins won't get tokens until an admin opens it."),
};

const ClaimedList = {
  view: (vnode) => {
    const items = vnode.attrs.claimed.map((c) => m("code", c));
    // Intersperse ", " between items.
    const out = [];
    items.forEach((el, i) => {
      if (i > 0) out.push(", ");
      out.push(el);
    });
    return out;
  },
};
