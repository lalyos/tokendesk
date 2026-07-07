// Admin pools page. SPEC.md §7.1 "/admin/pools".
//   - list of pools with {name, total, free, assigned}
//   - "create pool" form (name + tokens textarea)
//   - per pool: "view tokens" expansion with show/hide + copy, "add tokens" form
//
// Window/claim is out of scope here (postponed); the page assumes the admin
// can manage pool contents, claim wiring lands later.

import { apiGet, apiPost, apiSend, parseTokenList } from "../lib/api.js";
import { copyToClipboard } from "../lib/clipboard.js";

const POOL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const AdminPools = {
  oninit: async (vnode) => {
    vnode.state.pools = [];
    vnode.state.expanded = new Set();
    vnode.state.revealedAll = new Set();
    vnode.state.revealedOne = new Set();
    vnode.state.detail = {};
    vnode.state.detailLoading = {};
    vnode.state.detailError = {};
    vnode.state.addForms = {};
    vnode.state.flash = null;
    vnode.state.error = null;
    vnode.state.createForm = { name: "", tokens: "", busy: false, error: null };
    await refresh(vnode);
  },
  view: (vnode) =>
    m("main.container", [
      m("h1", "Pools"),
      vnode.state.error ? m("p.error", vnode.state.error) : null,
      vnode.state.flash ? m("p.ok", vnode.state.flash) : null,
      m(PoolList, { state: vnode.state }),
      m(CreateForm, { state: vnode.state }),
    ]),
};

async function refresh(vnode) {
  vnode.state.loading = true;
  vnode.state.error = null;
  try {
    vnode.state.pools = await apiGet("/api/admin/pools");
  } catch (e) {
    vnode.state.error = e instanceof Error ? e.message : String(e);
  }
  vnode.state.loading = false;
  m.redraw();
}

function ensureAddForm(state, name) {
  if (!state.addForms[name]) {
    state.addForms[name] = { tokens: "", busy: false, error: null };
  }
  return state.addForms[name];
}

// --- Create pool form ---

const CreateForm = {
  view: (vnode) => {
    const s = vnode.attrs.state;
    const f = s.createForm;
    const submit = async (e) => {
      e.preventDefault();
      const name = f.name.trim();
      const tokens = parseTokenList(f.tokens);
      if (!POOL_NAME_RE.test(name)) {
        f.error = "invalid pool name (lowercase, digits, dashes; 1-32 chars; no leading dash)";
        m.redraw();
        return;
      }
      if (tokens.length === 0) {
        f.error = "paste at least one token";
        m.redraw();
        return;
      }
      f.busy = true;
      f.error = null;
      try {
        await apiPost("/api/admin/pools", { name, tokens });
        f.name = "";
        f.tokens = "";
        s.flash = `Pool '${name}' created with ${tokens.length} token(s).`;
        await refresh({ state: s });
      } catch (e) {
        f.error = e instanceof Error ? e.message : String(e);
      } finally {
        f.busy = false;
        m.redraw();
      }
    };
    return m("section.card", [
      m("h2", "Create pool"),
      m("form", { onsubmit: submit }, [
        m("label.field", [
          m("span", "Name"),
          m("input", {
            type: "text",
            placeholder: "openrouter",
            value: f.name,
            oninput: (e) => (f.name = e.target.value),
            disabled: f.busy,
            required: true,
          }),
        ]),
        m("label.field", [
          m("span", "Tokens (one per line)"),
          m("textarea", {
            rows: 6,
            placeholder: "sk-or-v1-...\nsk-or-v1-...",
            value: f.tokens,
            oninput: (e) => (f.tokens = e.target.value),
            disabled: f.busy,
          }),
        ]),
        f.error ? m("p.error", f.error) : null,
        m(
          "button.btn.btn-primary",
          { type: "submit", disabled: f.busy },
          f.busy ? "Creating..." : "Create pool",
        ),
      ]),
    ]);
  },
};

// --- Pool list ---

const PoolList = {
  view: (vnode) => {
    const s = vnode.attrs.state;
    if (s.loading && s.pools.length === 0) return m("p.muted", "Loading...");
    if (s.pools.length === 0) return m("p.muted", "No pools yet. Create one above.");
    return m("section", { style: { marginBottom: "2rem" } }, [
      m("h2", "Pools"),
      m("table.pools", [
        m("thead", m("tr", [m("th", "Name"), m("th", "Total"), m("th", "Free"), m("th", "Assigned"), m("th", "")])),
        s.pools.flatMap((p) => m(PoolRow, { state: s, pool: p })),
      ]),
    ]);
  },
};

const PoolRow = {
  view: (vnode) => {
    const s = vnode.attrs.state;
    const p = vnode.attrs.pool;
    const expanded = s.expanded.has(p.name);
    const toggle = () => {
      if (expanded) s.expanded.delete(p.name);
      else {
        s.expanded.add(p.name);
        ensureAddForm(s, p.name);
        if (!s.detail[p.name] && !s.detailLoading[p.name]) loadDetail(s, p.name);
      }
      m.redraw();
    };
    const doDelete = async () => {
      const assignedNote = p.assigned > 0
        ? ` ${p.assigned} token(s) are currently assigned to users and those users will lose access.`
        : "";
      const msg = `Delete pool '${p.name}'? This removes ${p.total} token(s).${assignedNote} This cannot be undone.`;
      if (!window.confirm(msg)) return;
      s.error = null;
      try {
        await apiSend("DELETE", `/api/admin/pools/${encodeURIComponent(p.name)}`);
        s.expanded.delete(p.name);
        s.revealedAll.delete(p.name);
        s.detail[p.name] = undefined;
        s.flash = `Pool '${p.name}' deleted.`;
        await refresh({ state: s });
      } catch (e) {
        s.error = e instanceof Error ? e.message : String(e);
        m.redraw();
      }
    };
    return [
      m("tr", [
        m("td", m("code", p.name)),
        m("td", p.total),
        m("td", p.free),
        m("td", p.assigned),
        m("td", [
          m("button.btn.small", { type: "button", onclick: toggle }, expanded ? "Hide tokens" : "View tokens"),
          " ",
          m("button.btn.small.danger", { type: "button", onclick: doDelete, title: `Delete pool '${p.name}'` }, "Delete"),
        ]),
      ]),
      expanded ? m("tr.expand", m("td.expand-cell", { colspan: 5 }, m(PoolDetail, { state: s, pool: p }))) : null,
    ];
  },
};

async function loadDetail(state, name) {
  state.detailLoading[name] = true;
  state.detailError[name] = null;
  try {
    state.detail[name] = await apiGet(`/api/admin/pools/${encodeURIComponent(name)}`);
  } catch (e) {
    state.detailError[name] = e instanceof Error ? e.message : String(e);
  }
  state.detailLoading[name] = false;
  m.redraw();
}

// --- Expanded detail ---

const PoolDetail = {
  view: (vnode) => {
    const s = vnode.attrs.state;
    const p = vnode.attrs.pool;
    const loading = !!s.detailLoading[p.name];
    const err = s.detailError[p.name];
    const detail = s.detail[p.name];
    const addForm = ensureAddForm(s, p.name);
    const revealedAll = s.revealedAll.has(p.name);
    return m("div.detail", [
      err ? m("p.error", err) : null,
      m(AddTokenForm, { state: s, pool: p, form: addForm }),
      loading && !detail ? m("p.muted", "Loading tokens...") : m(TokenList, { state: s, pool: p, tokens: detail?.tokens ?? [], revealedAll }),
      m("div.row", [
        m(
          "button.btn.small",
          {
            type: "button",
            disabled: !detail || detail.tokens.length === 0,
            onclick: async () => {
              const ok = await copyToClipboard(detail.tokens.map((t) => t.value).join("\n"));
              s.flash = ok ? "All tokens copied." : "Copy failed.";
              m.redraw();
            },
          },
          "Copy all",
        ),
        " ",
        m(
          "button.btn.small",
          {
            type: "button",
            disabled: !detail || detail.tokens.length === 0,
            onclick: () => {
              if (revealedAll) s.revealedAll.delete(p.name);
              else s.revealedAll.add(p.name);
              m.redraw();
            },
          },
          revealedAll ? "Hide all" : "Reveal all",
        ),
      ]),
    ]);
  },
};

const TokenList = {
  view: (vnode) => {
    const s = vnode.attrs.state;
    const tokens = vnode.attrs.tokens;
    const revealedAll = vnode.attrs.revealedAll;
    if (tokens.length === 0) return m("p.muted", "No tokens in this pool yet.");
    return m(
      "table.tokens",
      m(
        "tbody",
        tokens.map((t) => {
          const shown = revealedAll || s.revealedOne.has(t.id);
          return m("tr", [
            m("td.id", `#${t.id}`),
            m("td.val", [
              m("code", shown ? t.value : "••••••••"),
              " ",
              m(
                "button.btn.tiny",
                {
                  type: "button",
                  onclick: () => {
                    if (s.revealedOne.has(t.id)) s.revealedOne.delete(t.id);
                    else s.revealedOne.add(t.id);
                    m.redraw();
                  },
                },
                shown ? "Hide" : "Show",
              ),
            ]),
            m("td.assigned", t.assigned_to ? m("code", t.assigned_to) : m("span.muted", "free")),
            m("td", [
              m(
                "button.btn.tiny",
                {
                  type: "button",
                  onclick: async () => {
                    const ok = await copyToClipboard(t.value);
                    s.flash = ok ? `Token #${t.id} copied.` : "Copy failed.";
                    m.redraw();
                  },
                },
                "Copy",
              ),
            ]),
          ]);
        }),
      ),
    );
  },
};

const AddTokenForm = {
  view: (vnode) => {
    const s = vnode.attrs.state;
    const p = vnode.attrs.pool;
    const f = vnode.attrs.form;
    const submit = async (e) => {
      e.preventDefault();
      const tokens = parseTokenList(f.tokens);
      if (tokens.length === 0) {
        f.error = "paste at least one token";
        m.redraw();
        return;
      }
      f.busy = true;
      f.error = null;
      try {
        const detail = await apiPost(`/api/admin/pools/${encodeURIComponent(p.name)}`, { tokens });
        s.detail[p.name] = detail;
        f.tokens = "";
        s.flash = `Added ${tokens.length} token(s) to '${p.name}'.`;
        await refresh({ state: s });
      } catch (e) {
        f.error = e instanceof Error ? e.message : String(e);
      } finally {
        f.busy = false;
        m.redraw();
      }
    };
    return m("form.add-form", { onsubmit: submit }, [
      m("label.field", [
        m("span", "Add tokens (one per line)"),
        m("textarea", {
          rows: 4,
          value: f.tokens,
          oninput: (e) => (f.tokens = e.target.value),
          disabled: f.busy,
        }),
      ]),
      f.error ? m("p.error", f.error) : null,
      m("button.btn", { type: "submit", disabled: f.busy }, f.busy ? "Adding..." : "Add tokens"),
    ]);
  },
};
