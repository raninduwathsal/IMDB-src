(async function () {
  const apiKeyEl = document.getElementById("apiKey");
  const shortcutEl = document.getElementById("shortcut");
  const statusEl = document.getElementById("status");
  const form = document.getElementById("form");
  const clearBtn = document.getElementById("clearKey");

  let currentSettings = null;

  async function load() {
    currentSettings = await self.Settings.getSettings();
    // Do not prefill the key; show hint if one exists
    if (currentSettings.apiKey) {
      apiKeyEl.placeholder = "Key is saved (hidden)";
    }
    shortcutEl.value = currentSettings.inPageShortcut || "Ctrl+Space";
  }

  async function save(e) {
    e.preventDefault();
    const next = {
      inPageShortcut: (shortcutEl.value.trim() || "Ctrl+Space")
    };
    const newKey = apiKeyEl.value.trim();
    // Only update apiKey if user entered a value
    if (newKey) {
      next.apiKey = newKey;
    }
    currentSettings = await self.Settings.setSettings(next);
    statusEl.textContent = "Saved.";
    apiKeyEl.value = ""; // clear field after save
    apiKeyEl.placeholder = currentSettings.apiKey ? "Key is saved (hidden)" : "Enter your OMDb API key";
    try { await chrome.runtime.sendMessage({ type: "broadcast-config" }); } catch {}
    setTimeout(() => (statusEl.textContent = ""), 1500);
  }

  async function clearKey() {
    await self.Settings.setSettings({ apiKey: "" });
    statusEl.textContent = "Key cleared.";
    apiKeyEl.value = "";
    apiKeyEl.placeholder = "Enter your OMDb API key";
    try { await chrome.runtime.sendMessage({ type: "broadcast-config" }); } catch {}
    setTimeout(() => (statusEl.textContent = ""), 1500);
  }

  form.addEventListener("submit", save);
  clearBtn.addEventListener("click", clearKey);
  load();
})();
