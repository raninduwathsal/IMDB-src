(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const sendBG = (msg) => new Promise((res) => api.runtime.sendMessage(msg, (r) => res(r)));

  let lastPath = location.pathname;
  let btn;

  // Observe SPA navigation + DOM changes
  const observer = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      onRouteChange();
    } else {
      maybeInject();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("popstate", onRouteChange);
  window.addEventListener("pageshow", onRouteChange);

  onRouteChange();

  function onRouteChange() {
    removeButton();
    maybeInject();
  }

  function isTitlePage() {
    return /^\/title\/tt\d+/.test(location.pathname);
  }

  function maybeInject() {
    if (!isTitlePage()) { removeButton(); return; }
    if (btn && document.contains(btn)) return;
    injectButton();
  }

  function injectButton() {
    const imdbId = getImdbId();
    if (!imdbId) return;

    btn = document.createElement("button");
    btn.setAttribute("data-vidsrc-btn", "1");
    btn.textContent = "Open in vidsrc";
    btn.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483645;
      padding: 12px 16px; border-radius: 999px; font-size: 14px;
      color: #f7faff; border: 1px solid rgba(255,255,255,0.28);
      background: rgba(255,255,255,0.14);
      backdrop-filter: saturate(180%) blur(12px);
      box-shadow: 0 6px 18px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.22);
      cursor: pointer;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(255,255,255,0.20)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(255,255,255,0.14)";
    });

    btn.addEventListener("click", async () => {
      const type = await determineTypeWithFallback(imdbId);
      await sendBG({ type: "openEmbed", imdbId, kind: type });
    });

    document.documentElement.appendChild(btn);
  }

  function removeButton() {
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    btn = null;
  }

  function getImdbId() {
    const m = location.pathname.match(/\/title\/(tt\d+)/i);
    return m ? m[1] : null;
  }

  async function determineTypeWithFallback(imdbId) {
    // 1) OMDb
    try {
      const data = await sendBG({ type: "omdbLookup", imdbId });
      const t = normalizeType(data?.Type);
      if (t) return t;
    } catch (_) {}

    // 2) og:type meta
    try {
      const og = document.querySelector('meta[property="og:type"]')?.getAttribute("content") || "";
      const mapped = mapOgType(og);
      if (mapped) return mapped;
    } catch (_) {}

    // 3) JSON-LD
    try {
      const nodes = document.querySelectorAll('script[type="application/ld+json"]');
      for (const node of nodes) {
        const txt = node.textContent || "";
        const json = JSON.parse(txt);
        const typ = Array.isArray(json) ? json : [json];
        for (const item of typ) {
          const at = (item && item["@type"]) || "";
          const t = normalizeJsonLdType(at);
          if (t) return t;
        }
      }
    } catch (_) {}

    // 4) default
    return "movie";
  }

  function normalizeType(t) {
    if (!t) return null;
    const v = String(t).toLowerCase();
    if (v === "series" || v.includes("series") || v.includes("tv")) return "series";
    if (v === "movie" || v.includes("movie") || v.includes("film")) return "movie";
    return null;
  }

  function mapOgType(v) {
    const s = String(v || "").toLowerCase();
    if (s.includes("tv") || s.includes("video.tv_show")) return "series";
    if (s.includes("movie") || s.includes("video.movie")) return "movie";
    return null;
  }

  function normalizeJsonLdType(v) {
    const s = String(v || "").toLowerCase();
    if (s.includes("tvseries") || s.includes("tvepisode")) return "series";
    if (s.includes("movie") || s.includes("film")) return "movie";
    return null;
  }
})();
