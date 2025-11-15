// Minimal helpers
const getSettings = async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  // Keep fallback here (background only), not in content
  return Object.assign(
    { apiKey: "", inPageShortcut: "Ctrl+Space" },
    settings || {}
  );
};

const toggleOverlayOnActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  const trySend = async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "toggle-overlay" });
      return true;
    } catch {
      return false;
    }
  };
  const ok = await trySend();
  if (ok) return;

  // Retry after a short delay (content script may not be loaded yet on fast navigation)
  setTimeout(async () => {
    const secondOk = await trySend();
    if (secondOk) return;

    // Optional: attempt injection if scripting permission exists (will fail silently if not allowed)
    if (chrome.scripting && tab.url && /^https?:/.test(tab.url)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lib/polyfill.js", "lib/storage.js", "content/overlay.js"]
        });
        // After injection, toggle again
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { type: "toggle-overlay" }).catch(() => {});
        }, 100);
      } catch {
        // ignore injection errors
      }
    }
  }, 250);
};

chrome.runtime.onInstalled.addListener(async (details) => {
  const { settings } = await chrome.storage.sync.get("settings");
  if (!settings) {
    // Do not persist a built-in key; only set non-sensitive defaults
    await chrome.storage.sync.set({
      settings: { inPageShortcut: "Ctrl+Space" }
    });
  }
  if (details && details.reason === "install") {
    try { await chrome.runtime.openOptionsPage(); } catch {}
  }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "toggle-overlay") {
    await toggleOverlayOnActiveTab();
  }
});

chrome.action.onClicked.addListener(async () => {
  await toggleOverlayOnActiveTab();
});

// Broadcast setting updates without the API key
const broadcastSettings = async () => {
  const tabs = await chrome.tabs.query({});
  const cfg = await getSettings();
  const redacted = { inPageShortcut: cfg.inPageShortcut }; // omit apiKey
  for (const t of tabs) {
    try {
      await chrome.tabs.sendMessage(t.id, { type: "config-updated", settings: redacted });
    } catch {
      // ignore
    }
  }
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    broadcastSettings();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "broadcast-config") {
      await broadcastSettings();
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "open-vidsrc") {
      const { imdbId, mediaType } = msg;
      if (!imdbId) {
        sendResponse({ ok: false, error: "Missing imdbId" });
        return;
      }
      const typePath = mediaType === "series" ? "tv" : "movie";
      const url = `https://vidsrc-embed.ru/embed/${typePath}/${encodeURIComponent(imdbId)}`;
      await chrome.tabs.create({ url });
      sendResponse({ ok: true, url });
      return;
    }

    if (msg?.type === "omdb-search") {
      const settings = await getSettings();
      // Use per-user key if present; otherwise use fallback here in background
      const apiKey = settings.apiKey || "334146b6";
      const q = (msg.query || "").trim();
      if (!q) { sendResponse({ ok: true, results: [] }); return; }
      const url = new URL("https://www.omdbapi.com/");
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("s", q);
      if (msg.filterType) url.searchParams.set("type", msg.filterType);
      url.searchParams.set("page", "1");
      url.searchParams.set("r", "json");
      try {
        const res = await fetch(url.toString(), { method: "GET" });
        const json = await res.json();
        if (json?.Response === "False") {
          sendResponse({ ok: false, error: json?.Error || "OMDb error" });
          return;
        }
        sendResponse({ ok: true, results: (json.Search || []).slice(0, 8) });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }

    if (msg?.type === "omdb-by-id") {
      const settings = await getSettings();
      const apiKey = settings.apiKey || "334146b6";
      const imdbId = msg.imdbId;
      if (!imdbId) { sendResponse({ ok: false, error: "Missing imdbId" }); return; }
      const url = new URL("https://www.omdbapi.com/");
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("i", imdbId);
      url.searchParams.set("r", "json");
      try {
        const res = await fetch(url.toString(), { method: "GET" });
        const json = await res.json();
        sendResponse({ ok: true, data: json });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })();
  return true;
});
