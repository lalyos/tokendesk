// Pool tokens page. SPEC.md §7.1 "/tokens" (post-rename).
//   - shows pool tokens the user has been assigned
//   - click-to-reveal + copy
//   - empty state reflects the current claim-window state
//
// API key lives on its own page (/#/api-key).

import { apiGet, ApiError } from "../lib/api.js";
import { copyToClipboard } from "../lib/clipboard.js";

export const Tokens = {
  oninit: async (vnode) => {
    vnode.state.loading = true;
    vnode.state.error = null;
    vnode.state.flash = null;
    vnode.state.poolTokens = {};
    vnode.state.poolNames = [];
    vnode.state.revealed = new Set();
    await loadPoolTokens(vnode);
    vnode.state.loading = false;
  },
  view: (vnode) =>
    m("main.container", [
      m("h1", "Tokens"),
      vnode.state.error ? m("p.error", vnode.state.error) : null,
      vnode.state.flash ? m("p.ok", vnode.state.flash) : null,
      m(PoolsSection, { vnode }),
    ]),
};

async function loadPoolTokens(vnode) {
  try {
    const tokens = await apiGet("/api/tokens");
    vnode.state.poolTokens = tokens || {};
    vnode.state.poolNames = Object.keys(tokens || {}).sort();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      vnode.state.poolTokens = {};
      vnode.state.poolNames = [];
    } else {
      vnode.state.error = e instanceof Error ? e.message : String(e);
    }
  }
}

const PoolsSection = {
  view: (vnode) => {
    const s = vnode.attrs.vnode.state;
    if (s.loading && s.poolNames.length === 0) {
      return m("section", m("p.muted", "Loading..."));
    }
    if (s.poolNames.length === 0) {
      const me = window.__td_me ? window.__td_me() : null;
      const open = me?.window_open;
      return m("section", [
        m("h2", "Pool tokens"),
        open
          ? m("p.ok", "Claim window is OPEN. Log out and back in to claim a token from each pool.")
          : m("p.muted", "You have no tokens assigned. The claim window is currently closed — check back after an admin opens it."),
      ]);
    }
    return m("section", [
      m("h2", "Pool tokens"),
      m("table.tokens", [
        m("thead", m("tr", [m("th", "Pool"), m("th", "Value"), m("th", "")])),
        m(
          "tbody",
          s.poolNames.map((name) => m(PoolRow, { vnode: vnode.attrs.vnode, name })),
        ),
      ]),
    ]);
  },
};

const PoolRow = {
  view: (vnode) => {
    const s = vnode.attrs.vnode.state;
    const name = vnode.attrs.name;
    const value = s.poolTokens[name] ?? "";
    const revealed = s.revealed.has(name);
    return m("tr", [
      m("td", m("code", name)),
      m("td.val", [
        m("code", revealed ? value : "••••••••"),
        " ",
        m(
          "button.btn.tiny",
          {
            type: "button",
            onclick: () => {
              if (revealed) s.revealed.delete(name);
              else s.revealed.add(name);
              m.redraw();
            },
          },
          revealed ? "Hide" : "Show",
        ),
      ]),
      m("td", [
        m(
          "button.btn.tiny",
          {
            type: "button",
            onclick: async () => {
              const ok = await copyToClipboard(value);
              s.flash = ok ? `${name} copied.` : "Copy failed.";
              m.redraw();
            },
          },
          "Copy",
        ),
      ]),
    ]);
  },
};
