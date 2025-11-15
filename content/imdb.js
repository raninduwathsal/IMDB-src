(() => {
  const BTN_ID = "__open_vidsrc_btn__";
  let currentImdbId = null;

  function isTitlePage() {
    return /^\/title\/tt\d+/.test(location.pathname);
  }

  function extractImdbId() {
    const m = location.pathname.match(/\/title\/(tt\d+)/);
    return m ? m[1] : null;
  }

  function ensureButton() {
    if (!isTitlePage()) {
      removeButton();
      currentImdbId = null;
      return;
    }
    const imdbId = extractImdbId();
    if (!imdbId) return;

    currentImdbId = imdbId;

    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.textContent = "Open in vidsrc";
    Object.assign(btn.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      zIndex: "2147483646",
      padding: "12px 16px",
      borderRadius: "14px",
      border: "1px solid rgba(255,255,255,0.35)",
      background: "rgba(255,255,255,0.25)",
      color: "#111",
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      backdropFilter: "blur(10px) saturate(160%)",
      WebkitBackdropFilter: "blur(10px) saturate(160%)",
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontWeight: "600",
      cursor: "pointer"
    });

    btn.addEventListener("click", async () => {
      const mediaType = await determineTypeWithFallback(imdbId);
      try {
        await chrome.runtime.sendMessage({
          type: "open-vidsrc",
          imdbId,
          mediaType
        });
      } catch {
        // ignore
      }
    });

    document.documentElement.appendChild(btn);
  }

  function removeButton() {
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.remove();
  }

  async function determineTypeWithFallback(imdbId) {
    // Try OMDb
    try {
      const res = await chrome.runtime.sendMessage({ type: "omdb-by-id", imdbId });
      const type = res?.data?.Type;
      if (type === "series" || type === "movie") return type;
    } catch {
      // ignore
    }
    // Fallback: og:type -> video.tv_show | video.movie
    try {
      const og = document.querySelector('meta[property="og:type"]')?.getAttribute("content") || "";
      if (/tv/.test(og)) return "series";
      if (/movie/.test(og)) return "movie";
    } catch {}
    // Fallback: JSON-LD
    try {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || "{}");
          const type = (Array.isArray(data["@type"]) ? data["@type"][0] : data["@type"]) || "";
          if (/TVSeries/i.test(type)) return "series";
          if (/Movie/i.test(type)) return "movie";
        } catch { /* ignore */ }
      }
    } catch {}
    // Final fallback
    return "movie";
  }

  // Observe SPA navigation on IMDb (pushState/replaceState/popstate)
  function installLocationObserver() {
    const fire = () => window.dispatchEvent(new Event("__imdb_location_changed__"));
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) { const r = origPush.apply(this, args); fire(); return r; };
    history.replaceState = function (...args) { const r = origReplace.apply(this, args); fire(); return r; };
    window.addEventListener("popstate", fire);
    window.addEventListener("__imdb_location_changed__", onLocationMaybeChanged);
    // Also watch title/body changes as a backup
    const mo = new MutationObserver((_) => onLocationMaybeChanged());
    mo.observe(document.documentElement, { subtree: true, childList: true });
  }

  let lastPath = location.pathname;
  function onLocationMaybeChanged() {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      removeButton();
      setTimeout(ensureButton, 300);
    } else {
      // still ensure in case content changed
      setTimeout(ensureButton, 300);
    }
  }

  // Init
  (function init() {
    ensureButton();
    installLocationObserver();
  })();
})();
