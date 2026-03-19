const DEFAULTS = {
  enabled: true,
  panelVisible: false,
  autoHideOnBlur: true,
  filterUsedWords: true,
  maxSuggestions: 12,
  minWordLength: 3
};

const extensionStorage = getExtensionStorage();

const enabledEl = document.getElementById("enabled");
const panelVisibleEl = document.getElementById("panelVisible");
const autoHideOnBlurEl = document.getElementById("autoHideOnBlur");
const filterUsedWordsEl = document.getElementById("filterUsedWords");
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
  autoHideOnBlurEl.addEventListener("change", saveFromUI);
  filterUsedWordsEl.addEventListener("change", saveFromUI);
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
    if (!extensionStorage) {
      resolve({ ...DEFAULTS });
      return;
    }

    extensionStorage.get(DEFAULTS, (result) => {
      resolve({ ...DEFAULTS, ...result });
    });
  });
}

function saveSettings(values) {
  return new Promise((resolve) => {
    if (!extensionStorage) {
      resolve();
      return;
    }

    extensionStorage.set(values, () => resolve());
  });
}

async function saveFromUI() {
  const values = {
    enabled: enabledEl.checked,
    panelVisible: panelVisibleEl.checked,
    autoHideOnBlur: autoHideOnBlurEl.checked,
    filterUsedWords: filterUsedWordsEl.checked,
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
  autoHideOnBlurEl.checked = Boolean(settings.autoHideOnBlur);
  filterUsedWordsEl.checked = Boolean(settings.filterUsedWords);
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

function getExtensionStorage() {
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    return chrome.storage.local;
  }

  if (typeof browser !== "undefined" && browser?.storage?.local) {
    return browser.storage.local;
  }

  return null;
}
