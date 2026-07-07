// My tokens page. SPEC.md §7.1 "/tokens".
//   - machine token section: meta + create/rotate, plaintext shown once
//   - pools section: pre-loaded from /api/tokens, click-to-reveal + copy
//
// Auth: cookie (set by /auth/callback). Page redirects to / if not logged in.

import { apiGet, apiPost, ApiError } from "../lib/api.js";
import { copyToClipboard } from "../lib/clipboard.js";

export const Tokens = {
  oninit: async (vnode) => {
    vnode.state.loading = true;
    vnode.state.error = null;
    vnode.state.flash = null;
    vnode.state.machineToken = { exists: false, created_at: null, rotated_at: null };
    vnode.state.newToken = null;          // plaintext returned by the most recent POST
    vnode.state.newTokenHidden = false;   // user can hide it after seeing it
    vnode.state.busy = false;             // disable buttons during POST
    vnode.state.poolTokens = {};          // { poolName: value } from /api/tokens
    vnode.state.poolNames = [];           // ordered list of names with assigned tokens
    vnode.state.revealed = new Set();     // per-pool-name reveal toggles
    await Promise.all([loadMeta(vnode), loadPoolTokens(vnode)]);
    vnode.state.loading = false;
  },
  view: (vnode) =>
    m("main.container", [
      m("h1", "My tokens"),
      vnode.state.error ? m("p.error", vnode.state.error) : null,
      vnode.state.flash ? m("p.ok", vnode.state.flash) : null,
      m(MachineTokenSection, { vnode }),
      m(PoolsSection, { vnode }),
    ]),
};

async function loadMeta(vnode) {
  try {
    vnode.state.machineToken = await apiGet("/api/me/machine-token");
  } catch (e) {
    vnode.state.error = e instanceof Error ? e.message : String(e);
  }
}

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

function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString();
}

// --- Machine token ---

const MachineTokenSection = {
  view: (vnode) => {
    const s = vnode.attrs.vnode.state;
    const mt = s.machineToken;
    const newTok = s.newToken;
    return m("section.card", [
      m("h2", "Machine token"),
      m("p.muted.small", "Use this token to call the API from CI/scripts. Format: td_pat_<32 hex>."),
      newTok
        ? m(NewTokenDisplay, { vnode })
        : m(ExistingTokenMeta, { vnode, mt }),
    ]);
  },
};

const ExistingTokenMeta = {
  view: (vnode) => {
    const s = vnode.attrs.vnode.state;
    const mt = vnode.attrs.mt;
    const create = async () => {
      s.busy = true;
      s.error = null;
      try {
        s.newToken = await apiPost("/api/me/machine-token", undefined);
        s.newTokenHidden = false;
        s.machineToken = {
          exists: true,
          created_at: s.newToken.created_at,
          rotated_at: s.newToken.rotated_at,
        };
        s.flash = "Machine token created.";
      } catch (e) {
        s.error = e instanceof Error ? e.message : String(e);
      } finally {
        s.busy = false;
        m.redraw();
      }
    };
    if (!mt.exists) {
      return m("div", [
        m("p", "You don't have a machine token yet."),
        m("button.btn.btn-primary", { type: "button", disabled: s.busy, onclick: create }, s.busy ? "Creating..." : "Create machine token"),
      ]);
    }
    return m("div", [
      m("dl.meta", [
        m("dt", "Created"),
        m("dd", fmtTime(mt.created_at)),
        m("dt", "Last rotated"),
        m("dd", fmtTime(mt.rotated_at)),
        m("dt", "Plaintext"),
        m("dd", m("em.muted", "hidden — rotate to view")),
      ]),
      m("button.btn", { type: "button", disabled: s.busy, onclick: create }, s.busy ? "Rotating..." : "Rotate machine token"),
    ]);
  },
};

const NewTokenDisplay = {
  view: (vnode) => {
    const s = vnode.attrs.vnode.state;
    const t = s.newToken;
    const shown = !s.newTokenHidden;
    return m("div.new-token", [
      m("p.warning", "This is the only time this token will be shown. Save it now."),
      m("div.row", [
        m("input.code", {
          type: shown ? "text" : "password",
          readonly: true,
          value: t.token,
          onfocus: (e) => e.target.select(),
        }),
        m(
          "button.btn",
          {
            type: "button",
            onclick: async () => {
              const ok = await copyToClipboard(t.token);
              s.flash = ok ? "Token copied." : "Copy failed.";
              m.redraw();
            },
          },
          "Copy",
        ),
        m(
          "button.btn",
          {
            type: "button",
            onclick: () => {
              s.newTokenHidden = !s.newTokenHidden;
              m.redraw();
            },
          },
          shown ? "Hide" : "Show",
        ),
        m(
          "button.btn",
          {
            type: "button",
            disabled: s.busy,
            onclick: async () => {
              s.busy = true;
              s.error = null;
              try {
                s.newToken = await apiPost("/api/me/machine-token", undefined);
                s.newTokenHidden = false;
                s.machineToken = {
                  exists: true,
                  created_at: s.newToken.created_at,
                  rotated_at: s.newToken.rotated_at,
                };
                s.flash = "Machine token rotated.";
              } catch (e) {
                s.error = e instanceof Error ? e.message : String(e);
              } finally {
                s.busy = false;
                m.redraw();
              }
            },
          },
          s.busy ? "Rotating..." : "Rotate again",
        ),
      ]),
    ]);
  },
};

// --- Pools ---

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
