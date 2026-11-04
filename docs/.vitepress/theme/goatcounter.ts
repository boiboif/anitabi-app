import type { Router } from 'vitepress';

const trackedOrigin = 'https://boiboif.github.io';
const trackedBase = '/anitabi-app';
const countEndpoint = 'https://boiboif.goatcounter.com/count';

/** Count document and SPA navigations using GoatCounter's pageview pixel. */
export function installGoatCounter(router: Router): void {
  if (window.location.origin !== trackedOrigin ||
      (window.location.pathname !== trackedBase && !window.location.pathname.startsWith(`${trackedBase}/`)) ||
      window.self !== window.top) return;

  let lastPath: string | undefined;
  const previousHook = router.onAfterRouteChange ?? router.onAfterRouteChanged;
  router.onAfterRouteChange = async (href) => {
    await previousHook?.(href);
    const url = new URL(href, trackedOrigin);
    if ((document.visibilityState as string) === 'prerender' || url.origin !== trackedOrigin ||
        (url.pathname !== trackedBase && !url.pathname.startsWith(`${trackedBase}/`)) || url.pathname === lastPath) return;
    lastPath = url.pathname;

    // count.js includes location.search in a separate q parameter even when a
    // custom path is supplied. The pixel lets us send only the path instead.
    const endpoint = new URL(countEndpoint);
    endpoint.searchParams.set('p', url.pathname);
    endpoint.searchParams.set('rnd', Math.random().toString(36).slice(2));
    void fetch(endpoint, { mode: 'no-cors', cache: 'no-store', keepalive: true, referrerPolicy: 'no-referrer' }).catch(() => {
      // Analytics failures must never interrupt navigation.
    });
  };
}
