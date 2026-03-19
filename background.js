const DEFAULTS = {
  panelVisible: false
};

const extensionStorage = getExtensionStorage();

if (typeof chrome !== "undefined" && chrome?.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (!extensionStorage) {
      return;
    }

    if (command === "toggle-panel") {
      extensionStorage.get(DEFAULTS, (settings) => {
        extensionStorage.set({ panelVisible: !settings.panelVisible });
      });
      return;
    }

    if (command === "refresh-suggestions") {
      extensionStorage.set({
        panelVisible: true,
        manualRefreshToken: Date.now()
      });
      return;
    }

    if (command === "panic-hide") {
      extensionStorage.set({ panelVisible: false });
    }
  });
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
