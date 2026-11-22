(function () {
  const siteBase = new URL("../", document.currentScript.src);
  const apiBase = "https://shwekurmzyzivtworjup.supabase.co/functions/v1/pupsik-api";

  window.Pupsik = Object.freeze({
    apiBase,
    // Public anon key, also returned by /admin?action=env. Never use a service-role key here.
    supabasePublicKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNod2VrdXJtenl6aXZ0d29yanVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzODQ5NjEsImV4cCI6MjA2MTk2MDk2MX0.wXm1enXaPxXk1r6gjtkE2yizxZayLJh4hXmMV54Up9k",
    apiUrl(path) {
      return `${apiBase}/${String(path).replace(/^\/?api(?:\/|$)/, "").replace(/^\//, "")}`;
    },
    posterUrl(value) {
      if (!value || typeof value !== "string") return value;
      try {
        const url = new URL(value);
        if (url.hostname === "kinopoiskapiunofficial.tech" && url.pathname.startsWith("/images/")) {
          return `${apiBase}/external?provider=poster-proxy&url=${encodeURIComponent(value)}`;
        }
      } catch {
        // Relative assets and data URLs keep their original location.
      }
      return value;
    },
    assetUrl(path) {
      return new URL(String(path).replace(/^\//, ""), siteBase).href;
    },
  });
})();
