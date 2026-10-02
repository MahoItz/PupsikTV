(function () {
  const siteBase = new URL("../", document.currentScript.src);
  const apiBase = "https://shwekurmzyzivtworjup.supabase.co/functions/v1/pupsik-api";

  window.Pupsik = Object.freeze({
    apiBase,
    apiUrl(path) {
      return `${apiBase}/${String(path).replace(/^\/?api(?:\/|$)/, "").replace(/^\//, "")}`;
    },
    assetUrl(path) {
      return new URL(String(path).replace(/^\//, ""), siteBase).href;
    },
  });
})();
