(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const sendBG = (msg) => new Promise((res) => api.runtime.sendMessage(msg, (r) => res(r)));
  const storageGet = (keys) => new Promise((res) => api.storage.sync.get(keys, (v) => res(v || {})));

  let isOpen = false;
  let overlay, panel, input, list, styleEl;
  let results = [];
  let selectedIndex = -1;
  let debounceTimer;
  let customShortcut = "Ctrl+Space";

  // Initialize settings and listeners
  (async function init() {
    try {
      const s = await storageGet(["customShortcut"]);
      if (s.customShortcut) customShortcut = s.customShortcut;
    } catch (_) {}
    api.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.customShortcut) {
        customShortcut = changes.customShortcut.newValue || "Ctrl+Space";
      }
    });
    api.runtime.onMessage.addListener((message) => {
      if (message?.type === "toggleOverlay") toggleOverlay();
    });
    document.addEventListener("keydown", onGlobalKeydown, true);
  })();

  function ensureUI() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.setAttribute("data-omdb-spotlight", "1");
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483646;
      display: none; align-items: center; justify-content: center;
      backdrop-filter: saturate(180%) blur(16px);
      background: rgba(15, 17, 20, 0.28);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif;
    `;

    panel = document.createElement("div");
    panel.style.cssText = `
      width: min(720px, 92vw);
      background: rgba(255, 255, 255, 0.10);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25);
      border-radius: 16px;
      padding: 16px 14px 8px 14px;
      color: #eef3ff;
    `;

    input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search OMDb…";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.cssText = `
      width: 100%;
      padding: 14px 16px;
      border-radius: 12px;
      background: rgba(255,255,255,0.16);
      border: 1px solid rgba(255,255,255,0.26);
      outline: none; color: #fff; font-size: 16px; line-height: 22px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
    `;

    list = document.createElement("div");
    list.setAttribute("role", "listbox");
    list.style.cssText = `
      margin-top: 10px; max-height: 52vh; overflow-y: auto;
      scrollbar-width: thin;
    `;

    styleEl = document.createElement("style");
    styleEl.textContent = `
      [data-omdb-spotlight] .item {
        display: grid; grid-template-columns: auto 1fr auto;
        gap: 12px; align-items: center;
        padding: 10px 12px; margin: 4px 0;
        border-radius: 10px; cursor: pointer;
        background: transparent; transition: background 120ms ease;
      }
      [data-omdb-spotlight] .item:hover,
      [data-omdb-spotlight] .item.active {
        background: rgba(255,255,255,0.14);
      }
      [data-omdb-spotlight] .poster {
        width: 34px; height: 50px; object-fit: cover; border-radius: 6px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.18);
      }
      [data-omdb-spotlight] .title { font-size: 15px; color: #f7f9ff; }
      [data-omdb-spotlight] .meta { font-size: 12px; opacity: 0.8; }
      [data-omdb-spotlight] .kbd {
        margin-left: 8px; padding: 2px 6px; border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.28);
        background: rgba(255,255,255,0.10);
        font-size: 11px; color: #eaf0ff; opacity: 0.85;
      }
      @media (prefers-color-scheme: light) {
        [data-omdb-spotlight] {
          background: rgba(255,255,255,0.58);
        }
        [data-omdb-spotlight] .title { color: #0b1220; }
        [data-omdb-spotlight] .meta { color: #233; opacity: 0.7; }
      }
    `;

    panel.appendChild(input);
    panel.appendChild(list);
    overlay.appendChild(styleEl);
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeOverlay();
    });
    input.addEventListener("input", onInputChanged);
    input.addEventListener("keydown", onInputKeydown);
  }

  function toggleOverlay() {
    if (isOpen) closeOverlay();
    else openOverlay();
  }
  function openOverlay() {
    ensureUI();
    overlay.style.display = "flex";
    isOpen = true;
    selectedIndex = -1;
    input.value = "";
    list.innerHTML = "";
    setTimeout(() => input.focus(), 0);
  }
  function closeOverlay() {
    if (!overlay) return;
    overlay.style.display = "none";
    isOpen = false;
    results = [];
    selectedIndex = -1;
  }

  function onGlobalKeydown(e) {
    try {
      if (matchesShortcut(e, customShortcut)) {
        e.preventDefault();
        e.stopPropagation();
        toggleOverlay();
        return;
      }
      if (isOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeOverlay();
        }
      }
    } catch (_) {}
  }

  function onInputChanged() {
    const q = input.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!q) { list.innerHTML = ""; results = []; selectedIndex = -1; return; }
      const data = await sendBG({ type: "omdbSearch", query: q });
      const arr = (data && data.Search) ? data.Search.slice(0, 8) : [];
      results = arr;
      renderList();
    }, 200);
  }

  function onInputKeydown(e) {
    // Keyboard navigation
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!results.length) return;
      selectedIndex = (selectedIndex + 1) % results.length;
      renderList();
      scrollActiveIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      selectedIndex = (selectedIndex - 1 + results.length) % results.length;
      renderList();
      scrollActiveIntoView();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        openResult(results[selectedIndex]);
      } else if (results.length === 1) {
        openResult(results[0]);
      }
    }
  }

  function renderList() {
    list.innerHTML = "";
    if (!results.length) return;
    results.forEach((r, i) => {
      const item = document.createElement("div");
      item.className = "item" + (i === selectedIndex ? " active" : "");
      const poster = document.createElement("img");
      poster.className = "poster";
      poster.alt = "";
      poster.src = (r.Poster && r.Poster !== "N/A") ? r.Poster : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

      const mid = document.createElement("div");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = r.Title || "(No title)";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = [r.Type, r.Year].filter(Boolean).join(" • ");

      mid.appendChild(title);
      mid.appendChild(meta);

      const kbd = document.createElement("div");
      kbd.className = "kbd";
      kbd.textContent = "Enter";

      item.appendChild(poster);
      item.appendChild(mid);
      item.appendChild(kbd);

      item.addEventListener("mouseenter", () => {
        selectedIndex = i;
        renderList();
      });
      item.addEventListener("click", () => openResult(r));

      list.appendChild(item);
    });
  }

  function scrollActiveIntoView() {
    const el = list.querySelector(".item.active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  async function openResult(r) {
    const imdbId = r.imdbID;
    const type = normalizeType(r.Type);
    if (!imdbId) return;
    await sendBG({ type: "openEmbed", imdbId, kind: type });
    closeOverlay();
  }

  function normalizeType(t) {
    const v = String(t || "").toLowerCase();
    if (v.startsWith("series") || v.includes("series") || v.includes("tv")) return "series";
    return "movie";
  }

  // Shortcut parser
  function matchesShortcut(event, shortcutString) {
    const sc = parseShortcut(shortcutString);
    if (!sc) return false;
    const key = normalizeKey(event.key);
    return !!(
      (!!sc.ctrl === !!event.ctrlKey) &&
      (!!sc.alt === !!event.altKey) &&
      (!!sc.shift === !!event.shiftKey) &&
      (sc.key === key)
    );
  }
  function parseShortcut(str) {
    if (!str) return null;
    const parts = String(str).split("+").map(s => s.trim().toLowerCase());
    const sc = { ctrl: false, alt: false, shift: false, key: "" };
    for (const p of parts) {
      if (p === "ctrl" || p === "control") sc.ctrl = true;
      else if (p === "alt" || p === "option") sc.alt = true;
      else if (p === "shift") sc.shift = true;
      else sc.key = normalizeKey(p);
    }
    return sc.key ? sc : null;
  }
  function normalizeKey(k) {
    if (!k) return "";
    const s = String(k).toLowerCase();
    if (s === "spacebar" || s === "space") return " ";
    return s.length === 1 ? s : s;
  }
})();
