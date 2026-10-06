// Shared renewal for the main site and the standalone admin player.
(() => {
  const DAY = 86400000;
  const RETRY_DELAY = 5 * 60000;
  let timer;
  let pending;
  let retryAt = 0;

  function getToken() {
    return localStorage.getItem("adminToken") || null;
  }

  function renewalTime(token) {
    try {
      const encoded = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(encoded));
      if (!Number.isFinite(payload.exp) || !Number.isFinite(payload.iat)) return 0;
      // Read timing only; the server still verifies the signature and permissions.
      return payload.exp - Math.min(7 * DAY, (payload.exp - payload.iat) / 4);
    } catch {
      return 0;
    }
  }

  function schedule() {
    clearTimeout(timer);
    const token = getToken();
    if (!token || document.visibilityState === "hidden") return;
    const delay = Math.max(renewalTime(token), retryAt) - Date.now();
    timer = setTimeout(() => { void refresh(); }, Math.min(DAY, Math.max(0, delay)));
  }

  function set(token, expiresAt) {
    if (token) {
      localStorage.setItem("adminToken", token);
      if (expiresAt) localStorage.setItem("adminTokenExpiresAt", expiresAt);
      else localStorage.removeItem("adminTokenExpiresAt");
    } else {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminTokenExpiresAt");
    }
    retryAt = 0;
    schedule();
    window.dispatchEvent(new Event("admin-session-change"));
  }

  async function renew() {
    const token = getToken();
    if (!token || Date.now() < Math.max(renewalTime(token), retryAt)) return;
    try {
      const response = await fetch(window.Pupsik.apiUrl("/api/admin?action=verify-admin"), {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      // A different tab or a manual logout may have changed the session meanwhile.
      if (getToken() !== token) return;
      if (response.status === 401) {
        set(null, null);
        return;
      }
      if (!response.ok) throw new Error(`Session renewal failed: ${response.status}`);
      const data = await response.json();
      if (!data.ok || typeof data.token !== "string" || !data.token) {
        throw new Error("Invalid session renewal response");
      }
      if (getToken() === token) set(data.token, data.expiresAt);
    } catch (error) {
      retryAt = Date.now() + RETRY_DELAY;
      console.warn("Admin session renewal will be retried", error);
    }
  }

  function refresh() {
    if (pending) return pending;
    const run = () => renew();
    // Serialize renewal across tabs, then re-read storage inside the lock.
    pending = (navigator.locks
      ? navigator.locks.request("pupsik-admin-renewal", run)
      : run()).finally(() => {
      pending = null;
      schedule();
    });
    return pending;
  }

  window.PupsikAdminSession = { getToken, set, refresh, schedule };
  window.addEventListener("storage", (event) => {
    if (event.key === "adminToken" || event.key === null) {
      schedule();
      window.dispatchEvent(new Event("admin-session-change"));
    }
  });
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("online", schedule);
  schedule();
})();
