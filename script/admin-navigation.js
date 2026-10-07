// Shared admin navigation for standalone pages.
(() => {
  let revision = 0;

  async function updateNavigation() {
    const currentRevision = ++revision;
    const links = document.querySelectorAll('[data-admin-navigation]');
    links.forEach((link) => {
      link.hidden = true;
      link.style.display = 'none';
    });
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const response = await fetch(window.Pupsik.apiUrl('/api/admin?action=verify-admin'), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (currentRevision !== revision || localStorage.getItem('adminToken') !== token) return;
      links.forEach((link) => {
        const isAdmin = data.ok === true;
        link.hidden = !isAdmin;
        if (isAdmin) link.style.removeProperty('display');
      });
    } catch {
      // Leave the navigation hidden if verification is unavailable.
    }
  }

  window.addEventListener('admin-session-change', updateNavigation);
  window.addEventListener('storage', (event) => {
    if (event.key === 'adminToken' || event.key === null) void updateNavigation();
  });
  window.addEventListener('pageshow', updateNavigation);
  void updateNavigation();
})();
