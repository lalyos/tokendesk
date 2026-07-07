// Landing page: shows login button or logged-in state via /api/me.

const content = document.getElementById("content");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadMe() {
  try {
    const res = await fetch("/api/me", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function renderError() {
  const url = new URL(window.location.href);
  const err = url.searchParams.get("error");
  if (!err) return "";
  return `<p class="error">Error: ${escapeHtml(err)}</p>`;
}

function render() {
  loadMe().then((user) => {
    if (user) {
      content.innerHTML = `
        <p class="lede">Logged in as <strong>${escapeHtml(user.gh_user)}</strong>${user.is_admin ? ' <span class="badge">admin</span>' : ""}</p>
        ${user.email ? `<p class="muted small">${escapeHtml(user.email)}</p>` : ""}
        <form method="post" action="/auth/logout">
          <button class="btn" type="submit">Logout</button>
        </form>
        ${renderError()}
      `;
    } else {
      content.innerHTML = `
        <p class="lede">Sign in with GitHub to claim tokens from admin-opened pools.</p>
        <a class="btn btn-primary" href="/auth/login">Login with GitHub</a>
        ${renderError()}
      `;
    }
  });
}

render();
