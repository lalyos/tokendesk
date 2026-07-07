// API key page. SPEC.md §6.1, §7.1.
// One API key per user, format td_pat_<32 hex> (yolo: stored cleartext).
// Create / rotate via POST /api/me/api-key; plaintext is exposed only
// in that response. Page pre-fetches GET /api/me/api-key for meta.

import { apiGet, apiPost } from "../lib/api.js";
import { copyToClipboard } from "../lib/clipboard.js";

export const ApiKey = {
  oninit: async (vnode) => {
    vnode.state.loading = true;
    vnode.state.error = null;
    vnode.state.flash = null;
    vnode.state.apiKey = { exists: false, created_at: null, rotated_at: null };
    vnode.state.newKey = null;          // plaintext returned by the most recent POST
    vnode.state.newKeyHidden = false;   // user can hide it after seeing it
    vnode.state.busy = false;           // disable buttons during POST
    await loadMeta(vnode);
    vnode.state.loading = false;
  },
  view: (vnode) =>
    m("main.container", [
      m("h1", "API key"),
      m("p.muted", "Use this key to call the API from CI/scripts. Format: td_pat_<32 hex>."),
      vnode.state.error ? m("p.error", vnode.state.error) : null,
      vnode.state.flash ? m("p.ok", vnode.state.flash) : null,
      vnode.state.newKey
        ? m(NewKeyDisplay, { vnode })
        : m(ExistingKeyMeta, { vnode, apiKey: vnode.state.apiKey }),
    ]),
};

async function loadMeta(vnode) {
  try {
    vnode.state.apiKey = await apiGet("/api/me/api-key");
  } catch (e) {
    vnode.state.error = e instanceof Error ? e.message : String(e);
  }
}

function fmtTime(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

const ExistingKeyMeta = {
  view: (vnode) => {
    const s = vnode.attrs.vnode.state;
    const k = vnode.attrs.apiKey;
    const create = async () => {
      s.busy = true;
      s.error = null;
      try {
        s.newKey = await apiPost("/api/me/api-key", undefined);
        s.newKeyHidden = false;
        s.apiKey = {
          exists: true,
          created_at: s.newKey.created_at,
          rotated_at: s.newKey.rotated_at,
        };
        s.flash = "API key created.";
      } catch (e) {
        s.error = e instanceof Error ? e.message : String(e);
      } finally {
        s.busy = false;
        m.redraw();
      }
    };
    if (!k.exists) {
      return m("div", [
        m("p", "You don't have an API key yet."),
        m(
          "button.btn.btn-primary",
          { type: "button", disabled: s.busy, onclick: create },
          s.busy ? "Creating..." : "Create API key",
        ),
      ]);
    }
    return m("div", [
      m("dl.meta", [
        m("dt", "Created"),
        m("dd", fmtTime(k.created_at)),
        m("dt", "Last rotated"),
        m("dd", fmtTime(k.rotated_at)),
        m("dt", "Plaintext"),
        m("dd", m("em.muted", "hidden — rotate to view")),
      ]),
      m(
        "button.btn",
        { type: "button", disabled: s.busy, onclick: create },
        s.busy ? "Rotating..." : "Rotate API key",
      ),
    ]);
  },
};

const NewKeyDisplay = {
  view: (vnode) => {
    const s = vnode.attrs.vnode.state;
    const k = s.newKey;
    const shown = !s.newKeyHidden;
    const rotate = async () => {
      s.busy = true;
      s.error = null;
      try {
        s.newKey = await apiPost("/api/me/api-key", undefined);
        s.newKeyHidden = false;
        s.apiKey = {
          exists: true,
          created_at: s.newKey.created_at,
          rotated_at: s.newKey.rotated_at,
        };
        s.flash = "API key rotated.";
      } catch (e) {
        s.error = e instanceof Error ? e.message : String(e);
      } finally {
        s.busy = false;
        m.redraw();
      }
    };
    return m("div.new-key", [
      m("p.warning", "This is the only time this key will be shown. Save it now."),
      m("div.row", [
        m("input.code", {
          type: shown ? "text" : "password",
          readonly: true,
          value: k.token,
          onfocus: (e) => e.target.select(),
        }),
        m(
          "button.btn",
          {
            type: "button",
            onclick: async () => {
              const ok = await copyToClipboard(k.token);
              s.flash = ok ? "Key copied." : "Copy failed.";
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
              s.newKeyHidden = !s.newKeyHidden;
              m.redraw();
            },
          },
          shown ? "Hide" : "Show",
        ),
        m(
          "button.btn",
          { type: "button", disabled: s.busy, onclick: rotate },
          s.busy ? "Rotating..." : "Rotate again",
        ),
      ]),
    ]);
  },
};
