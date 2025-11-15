// Simple settings wrapper with defaults and events
(function () {
  const DEFAULTS = {
    // Remove default API key from content scripts to avoid exposure
    apiKey: "",
    inPageShortcut: "Ctrl+Space"
  };

  async function getSettings() {
    try {
      const { settings } = await chrome.storage.sync.get("settings");
      return Object.assign({}, DEFAULTS, settings || {});
    } catch {
      return Object.assign({}, DEFAULTS);
    }
  }

  async function setSettings(partial) {
    const current = await getSettings();
    const next = Object.assign({}, current, partial || {});
    await chrome.storage.sync.set({ settings: next });
    return next;
  }

  // Expose globally
  self.Settings = { getSettings, setSettings, DEFAULTS };
})();
