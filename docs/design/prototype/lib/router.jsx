// claude-design: app/lib/router.jsx
// Hash-based router. Today wraps useState + window.location.hash;
// production swap to TanStack Router or React Router is a one-file change
// without touching call-sites.

const { useState: u_S_rt, useEffect: u_E_rt } = React;

function _parseHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  if (!raw) return { page: 'discover' };
  const parts = raw.split('/').filter(Boolean);
  if (parts.length === 0) return { page: 'discover' };
  const [page, id] = parts;
  return id ? { page, id } : { page };
}

function _serialize(route) {
  if (!route || !route.page || route.page === 'discover') return '#/';
  if (route.id) return `#/${route.page}/${route.id}`;
  return `#/${route.page}`;
}

function useRouter() {
  const [route, setRoute] = u_S_rt(_parseHash);
  u_E_rt(() => {
    const onHashChange = () => setRoute(_parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const goto = (r) => {
    setRoute(r);
    const h = _serialize(r);
    if (window.location.hash !== h) {
      window.location.hash = h;
    }
    document.querySelector('.page')?.scrollTo({ top: 0 });
  };
  return { route, goto };
}

window.RemyRouter = { useRouter };
