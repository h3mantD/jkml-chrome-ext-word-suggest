const DEFAULTS = {
  enabled: true,
  panelVisible: false,
  maxSuggestions: 12,
  minWordLength: 3
};

const enabledEl = document.getElementById("enabled");
const panelVisibleEl = document.getElementById("panelVisible");
const maxSuggestionsEl = document.getElementById("maxSuggestions");
const minWordLengthEl = document.getElementById("minWordLength");
const resetEl = document.getElementById("reset");
const statusEl = document.getElementById("status");

init().catch((error) => {
  console.error("[bombparty-helper] popup init failed", error);
});

async function init() {
  const settings = await getSettings();
  applyToUI(settings);

  enabledEl.addEventListener("change", saveFromUI);
  panelVisibleEl.addEventListener("change", saveFromUI);
  maxSuggestionsEl.addEventListener("change", saveFromUI);
  minWordLengthEl.addEventListener("change", saveFromUI);

  resetEl.addEventListener("click", async () => {
    await saveSettings(DEFAULTS);
    applyToUI(DEFAULTS);
    setStatus("Reset to defaults.");
  });
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS, (result) => {
      resolve({ ...DEFAULTS, ...result });
    });
  });
}

function saveSettings(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

async function saveFromUI() {
  const values = {
    enabled: enabledEl.checked,
    panelVisible: panelVisibleEl.checked,
    maxSuggestions: clampNumber(maxSuggestionsEl.value, 1, 50, DEFAULTS.maxSuggestions),
    minWordLength: clampNumber(minWordLengthEl.value, 2, 20, DEFAULTS.minWordLength)
  };

  await saveSettings(values);
  applyToUI(values);
  setStatus("Saved.");
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function applyToUI(settings) {
  enabledEl.checked = Boolean(settings.enabled);
  panelVisibleEl.checked = Boolean(settings.panelVisible);
  maxSuggestionsEl.value = String(settings.maxSuggestions);
  minWordLengthEl.value = String(settings.minWordLength);
}

function setStatus(message) {
  statusEl.textContent = message;
  window.setTimeout(() => {
    if (statusEl.textContent === message) {
      statusEl.textContent = "";
    }
  }, 1000);
}
