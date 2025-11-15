(() => {
  let settings = null;

  // Shortcut parsing
  function parseShortcut(shortcutStr) {
    // e.g., "Ctrl+Space", "Alt+Shift+K", "Meta+K"
    const parts = (shortcutStr || "").toLowerCase().split("+").map(s => s.trim()).filter(Boolean);
    const want = {
      ctrl: parts.includes("ctrl") || parts.includes("control"),
      alt: parts.includes("alt"),
      shift: parts.includes("shift"),
      meta: parts.includes("meta") || parts.includes("cmd") || parts.includes("command")
    };
    const key = parts.find(p => !["ctrl", "control", "alt", "shift", "meta", "cmd", "command"].includes(p));
    return (e) => {
      if ((e.ctrlKey || false) !== want.ctrl) return false;
      if ((e.altKey || false) !== want.alt) return false;
      if ((e.shiftKey || false) !== want.shift) return false;
      if ((e.metaKey || false) !== want.meta) return false;
      if (!key) return true;
      const code = e.code?.toLowerCase() || "";
      const k = e.key?.toLowerCase() || "";
      // match letters and space/enter
      if (key === "space") return k === " " || code === "space";
      return k === key || code === `key${key}` || code === key;
    };
  }

  // DOM
  let root, shadow, wrapper, input, list, hint, isOpen = false, matchShortcut = () => false;
  let selectedIndex = -1;
  let results = [];
  let lastQuery = "";
  let lastError = null;

  function ensureUI() {
    if (root) return;
    root = document.createElement("div");
    root.id = "__omdb_spotlight_root__";
    root.style.all = "initial"; // minimal leak
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.zIndex = "2147483647";
    root.style.display = "none";

    shadow = root.attachShadow({ mode: "open" });

    // Google Fonts link for Inter (best effort; fallback to system)
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    shadow.appendChild(link);

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif; }
      .backdrop {
        position: fixed; inset: 0;
        background: radial-gradient(1000px 600px at 50% -10%, rgba(255,255,255,0.35), rgba(0,0,0,0.25));
        backdrop-filter: blur(12px) saturate(160%);
        -webkit-backdrop-filter: blur(12px) saturate(160%);
      }
      .panel {
        position: absolute; left: 50%; top: 20%;
        transform: translateX(-50%);
        width: min(720px, calc(100vw - 32px));
        border-radius: 20px;
        background: rgba(255,255,255,0.20);
        border: 1px solid rgba(255,255,255,0.35);
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        overflow: hidden;
        color: #111;
      }
      .search {
        display: flex; align-items: center; gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.25);
        background: rgba(255,255,255,0.25);
      }
      .search input {
        flex: 1; font-size: 18px; padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255,255,255,0.65);
        border: 1px solid rgba(0,0,0,0.06);
        outline: none;
      }
      .hint {
        font-size: 12px; color: rgba(0,0,0,0.55);
      }
      .list {
        max-height: 420px; overflow: auto;
        background: rgba(255,255,255,0.35);
      }
      .row {
        display: grid; grid-template-columns: 48px 1fr auto;
        gap: 12px; align-items: center;
        padding: 10px 14px;
        cursor: pointer;
      }
      .row:hover, .row.active { background: rgba(255,255,255,0.55); }
      .poster {
        width: 48px; height: 72px; border-radius: 8px;
        background: rgba(0,0,0,0.08); object-fit: cover;
      }
      .title { font-weight: 600; }
      .meta { font-size: 12px; color: rgba(0,0,0,0.6); }
      .badge {
        font-size: 12px; padding: 4px 8px; border-radius: 999px;
        background: rgba(255,255,255,0.75); border: 1px solid rgba(0,0,0,0.06);
        color: #111;
      }
      .empty {
        padding: 16px; color: rgba(0,0,0,0.6);
      }
      .coffee {
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.75);
        border: 1px solid rgba(0,0,0,0.06);
        color: #111;
        text-decoration: none;
        white-space: nowrap;
      }
      .coffee:hover { background: rgba(255,255,255,0.9); }
    `;
    shadow.appendChild(style);

    wrapper = document.createElement("div");
    wrapper.className = "backdrop";

    const panel = document.createElement("div");
    panel.className = "panel";

    const search = document.createElement("div");
    search.className = "search";

    input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search movies and series via OMDb…";
    input.autocapitalize = "off";
    input.autocomplete = "off";
    input.spellcheck = false;

    hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Arrows to navigate • Enter to open • Esc to close";

    const coffee = document.createElement("a");
    coffee.className = "coffee";
    coffee.href = "https://buymeacoffee.com/raninduwathsal";
    coffee.target = "_blank";
    coffee.rel = "noopener noreferrer";
    coffee.textContent = "☕ Coffee";

    const listWrap = document.createElement("div");
    listWrap.className = "list";
    list = listWrap;

    search.appendChild(input);
    search.appendChild(hint);
    search.appendChild(coffee);
    panel.appendChild(search);
    panel.appendChild(listWrap);
    wrapper.appendChild(panel);
    shadow.appendChild(wrapper);

    // interactions
    wrapper.addEventListener("click", (e) => {
      if (e.target === wrapper) closeOverlay();
    });
    input.addEventListener("keydown", onInputKeydown);
    input.addEventListener("input", onInputChange);
    document.addEventListener("keydown", onGlobalKeydown, true);

    document.documentElement.appendChild(root);
  }

  function openOverlay() {
    ensureUI();
    isOpen = true;
    root.style.display = "block";
    setTimeout(() => input.focus(), 0);
    if (lastQuery) input.select();
  }

  function closeOverlay() {
    isOpen = false;
    if (root) root.style.display = "none";
    selectedIndex = -1;
  }

  function toggleOverlay() {
    if (isOpen) closeOverlay();
    else openOverlay();
  }

  function onGlobalKeydown(e) {
    try {
      if (matchShortcut && matchShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        toggleOverlay();
      }
      if (isOpen && e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      }
    } catch {
      // ignore
    }
  }

  function onInputKeydown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!results.length) return;
      selectedIndex = (selectedIndex + 1) % results.length;
      renderList();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      selectedIndex = (selectedIndex - 1 + results.length) % results.length;
      renderList();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        openResult(results[selectedIndex]);
      } else if (results.length === 1) {
        openResult(results[0]);
      }
      return;
    }
  }

  const debounce = (fn, ms) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const doSearch = debounce(async (q) => {
    lastQuery = q;
    lastError = null;
    if (!q || q.trim().length < 2) {
      results = [];
      selectedIndex = -1;
      renderList();
      return;
    }
    try {
      const res = await chrome.runtime.sendMessage({ type: "omdb-search", query: q.trim() });
      if (res?.ok) {
        results = res.results || [];
        lastError = null;
      } else {
        results = [];
        lastError = res?.error || "Search failed";
      }
    } catch (e) {
      results = [];
      lastError = String(e);
    }
    selectedIndex = results.length ? 0 : -1;
    renderList();
  }, 250);

  function onInputChange() {
    doSearch(input.value);
  }

  function renderList() {
    list.innerHTML = "";
    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = lastError
        ? `OMDb: ${lastError}`
        : (lastQuery ? "No results" : "Type to search OMDb…");
      list.appendChild(empty);
      return;
    }
    results.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "row" + (idx === selectedIndex ? " active" : "");
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      // Highlight on hover
      row.addEventListener("mouseover", () => {
        selectedIndex = idx; renderList();
      });
      // Allow mouse selection without opening (mousedown) then open on click
      row.addEventListener("mousedown", () => {
        selectedIndex = idx;
        renderList();
      });
      row.addEventListener("click", () => {
        openResult(item);
      });
      row.addEventListener("pointerup", (e) => {
        // Fallback open on pointer release if not already handled
        if (e.button === 0) openResult(item);
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openResult(item);
        }
      });

      const img = document.createElement("img");
      img.className = "poster";
      img.loading = "lazy";
      img.src = (item.Poster && item.Poster !== "N/A") ? item.Poster : "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

      const info = document.createElement("div");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = item.Title || "Untitled";
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = [item.Year, item.imdbID].filter(Boolean).join(" • ");

      info.appendChild(title);
      info.appendChild(meta);

      const tag = document.createElement("div");
      tag.className = "badge";
      tag.textContent = (item.Type || "").toUpperCase();

      row.appendChild(img);
      row.appendChild(info);
      row.appendChild(tag);
      list.appendChild(row);
    });
    // Scroll active row into view
    const active = list.querySelector(".row.active");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  async function openResult(item) {
    const imdbId = item.imdbID;
    const mediaType = item.Type === "series" ? "series" : "movie";
    try {
      await chrome.runtime.sendMessage({ type: "open-vidsrc", imdbId, mediaType });
    } catch {
      // ignore
    }
    closeOverlay();
  }

  // Messages
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "toggle-overlay") {
      toggleOverlay();
    } else if (msg?.type === "config-updated") {
      settings = msg.settings || settings;
      matchShortcut = parseShortcut(settings?.inPageShortcut || "Ctrl+Space");
    }
    sendResponse?.({ ok: true });
  });

  // Init
  (async function init() {
    settings = await self.Settings.getSettings();
    matchShortcut = parseShortcut(settings?.inPageShortcut || "Ctrl+Space");
    ensureUI();
  })();
})();
