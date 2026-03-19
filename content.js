(() => {
  const extensionStorage = getExtensionStorage();
  const isJklmSubdomain = /(^|\.)jklm\.fun$/.test(window.location.hostname);
  const isBombPartyPath = window.location.pathname.includes("/games/bombparty");
  const isBombPartyFrame = isJklmSubdomain && isBombPartyPath;

  const DEFAULT_SETTINGS = {
    enabled: true,
    panelVisible: false,
    autoHideOnBlur: true,
    filterUsedWords: true,
    maxSuggestions: 12,
    minWordLength: 3
  };

  if (!isBombPartyFrame) {
    bindBridgeHotkeys();
    return;
  }

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    words: [],
    index2: new Map(),
    index3: new Map(),
    currentChunk: "",
    lastRenderedChunk: "",
    loaded: false,
    timerId: null,
    observer: null,
    syllableObserver: null,
    syllableElement: null,
    pollTimerId: null,
    lockedChunkElement: null,
    lockMisses: 0,
    scanCount: 0,
    mutationCandidate: null,
    networkCandidate: null,
    usedWords: new Set(),
    hiddenByBlur: false,
    panel: null,
    chunkValue: null,
    statusValue: null,
    list: null
  };

  init().catch((error) => {
    console.error("[bombparty-helper] init failed", error);
  });

  async function init() {
    state.settings = await readSettings();
    startNetworkHooks();
    bindHotkeys();
    bindStorageListener();
    await waitForBody();
    createPanel();
    await loadDictionary();
    startObservers();
    scheduleScan();
  }

  function readSettings() {
    return new Promise((resolve) => {
      if (!extensionStorage) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }

      extensionStorage.get(DEFAULT_SETTINGS, (result) => {
        resolve({ ...DEFAULT_SETTINGS, ...result });
      });
    });
  }

  function writeSettings(next) {
    if (!extensionStorage) {
      return;
    }
    extensionStorage.set(next);
  }

  async function loadDictionary() {
    const url = chrome.runtime.getURL("data/words.txt");
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.split(/\r?\n/);
    const seen = new Set();

    for (const rawLine of lines) {
      const word = rawLine.trim().toLowerCase();
      if (!/^[a-z]{3,}$/.test(word)) {
        continue;
      }
      seen.add(word);
    }

    state.words = Array.from(seen);
    buildIndex();
    state.loaded = true;
    render();
  }

  function buildIndex() {
    state.index2.clear();
    state.index3.clear();

    for (const word of state.words) {
      const seen2 = new Set();
      const seen3 = new Set();

      for (let i = 0; i <= word.length - 2; i += 1) {
        seen2.add(word.slice(i, i + 2));
      }

      for (let i = 0; i <= word.length - 3; i += 1) {
        seen3.add(word.slice(i, i + 3));
      }

      for (const key of seen2) {
        if (!state.index2.has(key)) {
          state.index2.set(key, []);
        }
        state.index2.get(key).push(word);
      }

      for (const key of seen3) {
        if (!state.index3.has(key)) {
          state.index3.set(key, []);
        }
        state.index3.get(key).push(word);
      }
    }
  }

  function createPanel() {
    const style = document.createElement("style");
    style.textContent = `
      #jkml-helper-panel {
        position: fixed;
        right: 12px;
        bottom: 12px;
        width: min(340px, calc(100vw - 24px));
        max-height: min(60vh, 500px);
        z-index: 2147483647;
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: linear-gradient(180deg, rgba(24, 31, 37, 0.96), rgba(14, 18, 21, 0.96));
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.42);
        color: #e6eef5;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
        backdrop-filter: blur(4px);
      }

      #jkml-helper-panel[data-hidden="true"] {
        display: none;
      }

      #jkml-helper-panel .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.04);
      }

      #jkml-helper-panel .title {
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #8ec5ff;
      }

      #jkml-helper-panel .status {
        font-size: 11px;
        color: #aebcc7;
      }

      #jkml-helper-panel .chunkLine {
        padding: 8px 10px;
        font-size: 14px;
      }

      #jkml-helper-panel .chunk {
        display: inline-block;
        min-width: 36px;
        padding: 2px 8px;
        margin-left: 6px;
        border-radius: 8px;
        background: rgba(60, 135, 206, 0.25);
        color: #d5ecff;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-align: center;
      }

      #jkml-helper-panel ul {
        margin: 0;
        padding: 0 0 6px;
        list-style: none;
        max-height: 42vh;
        overflow-y: auto;
      }

      #jkml-helper-panel li {
        padding: 7px 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        cursor: pointer;
        font-size: 14px;
      }

      #jkml-helper-panel li:hover {
        background: rgba(142, 197, 255, 0.12);
      }

      #jkml-helper-panel .hint {
        color: #9eb0bf;
        font-size: 11px;
        padding: 8px 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
    `;

    document.documentElement.appendChild(style);

    state.panel = document.createElement("section");
    state.panel.id = "jkml-helper-panel";

    const header = document.createElement("div");
    header.className = "head";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "BombParty Helper";

    state.statusValue = document.createElement("div");
    state.statusValue.className = "status";
    state.statusValue.textContent = "Loading...";

    header.appendChild(title);
    header.appendChild(state.statusValue);

    const chunkLine = document.createElement("div");
    chunkLine.className = "chunkLine";
    chunkLine.textContent = "Chunk:";

    state.chunkValue = document.createElement("span");
    state.chunkValue.className = "chunk";
    state.chunkValue.textContent = "--";

    chunkLine.appendChild(state.chunkValue);

    state.list = document.createElement("ul");

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Ctrl/Cmd+Shift+X show/hide • Ctrl/Cmd+Shift+K refresh • Ctrl/Cmd+Shift+U clear used";

    state.panel.appendChild(header);
    state.panel.appendChild(chunkLine);
    state.panel.appendChild(state.list);
    state.panel.appendChild(hint);

    document.body.appendChild(state.panel);
  }

  function bindHotkeys() {
    window.addEventListener(
      "keydown",
      (event) => {
        const isTogglePanel = isHotkey(event, "KeyX") || isHotkey(event, "KeyJ");
        if (isTogglePanel) {
          event.preventDefault();
          event.stopPropagation();
          state.settings.panelVisible = !state.settings.panelVisible;
          writeSettings({ panelVisible: state.settings.panelVisible });
          render(true);
          return;
        }

        const isPanicHide = event.code === "Escape" && state.settings.panelVisible;
        if (isPanicHide) {
          state.settings.panelVisible = false;
          writeSettings({ panelVisible: false });
          render(true);
          return;
        }

        const isManualRefresh = isHotkey(event, "KeyK");
        if (isManualRefresh) {
          event.preventDefault();
          event.stopPropagation();
          scanChunk(true);
          if (state.settings.panelVisible) {
            state.statusValue.textContent = state.currentChunk
              ? `Refreshed: ${state.currentChunk}`
              : "Refresh: no chunk found";
          }
          return;
        }

        const isClearUsed = isHotkey(event, "KeyU");
        if (isClearUsed) {
          event.preventDefault();
          event.stopPropagation();
          state.usedWords.clear();
          state.statusValue.textContent = "Cleared used words";
          render(true);
        }
      },
      true
    );
  }

  function isHotkey(event, code) {
    const usesCtrlShift = event.ctrlKey && event.shiftKey;
    const usesCmdShift = event.metaKey && event.shiftKey;
    return (usesCtrlShift || usesCmdShift) && !event.altKey && event.code === code;
  }

  function bindBridgeHotkeys() {
    window.addEventListener(
      "keydown",
      (event) => {
        const isTogglePanel = isHotkey(event, "KeyX") || isHotkey(event, "KeyJ");
        if (isTogglePanel) {
          event.preventDefault();
          event.stopPropagation();
          if (!extensionStorage) {
            return;
          }

          extensionStorage.get(DEFAULT_SETTINGS, (settings) => {
            extensionStorage.set({ panelVisible: !settings.panelVisible });
          });
          return;
        }

        if (isHotkey(event, "KeyK")) {
          event.preventDefault();
          event.stopPropagation();
          if (!extensionStorage) {
            return;
          }

          extensionStorage.set({ manualRefreshToken: Date.now(), panelVisible: true });
          return;
        }

        if (isHotkey(event, "KeyU")) {
          event.preventDefault();
          event.stopPropagation();
          extensionStorage.set({ clearUsedWordsToken: Date.now() });
        }
      },
      true
    );
  }

  function bindStorageListener() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      let changed = false;

      for (const key of ["enabled", "panelVisible", "autoHideOnBlur", "filterUsedWords", "maxSuggestions", "minWordLength"]) {
        if (changes[key]) {
          state.settings[key] = changes[key].newValue;
          changed = true;
        }
      }

      if (changes.manualRefreshToken) {
        scanChunk(true);
        changed = true;
      }

      if (changes.clearUsedWordsToken) {
        state.usedWords.clear();
        changed = true;
      }

      if (changed) {
        render(true);
      }
    });
  }

  function startObservers() {
    state.observer = new MutationObserver((records) => {
      captureMutationCandidate(records);
      captureUsedWords(records);
      ensureSyllableWatcher();
      scheduleScan();
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    window.addEventListener("resize", scheduleScan);
    document.addEventListener("visibilitychange", () => {
      applyAutoHideByVisibility();
      scheduleScan();
    });
    window.addEventListener("focus", () => {
      scheduleScan();
    });
    window.addEventListener("blur", () => {
      applyAutoHideByVisibility();
      scheduleScan();
    });
    document.addEventListener(
      "input",
      () => {
        ensureSyllableWatcher();
        scheduleScan(10);
      },
      true
    );

    ensureSyllableWatcher();
    startAdaptivePolling();
  }

  function applyAutoHideByVisibility() {
    if (!state.settings.autoHideOnBlur) {
      return;
    }

    const shouldHide = document.hidden || !document.hasFocus();
    if (!shouldHide || !state.settings.panelVisible) {
      return;
    }

    state.hiddenByBlur = true;
    state.settings.panelVisible = false;
    writeSettings({ panelVisible: false });
    render(true);
  }

  function startAdaptivePolling() {
    if (state.pollTimerId !== null) {
      window.clearTimeout(state.pollTimerId);
    }

    const tick = () => {
      ensureSyllableWatcher();
      scheduleScan(20);
      state.pollTimerId = window.setTimeout(tick, getPollDelay());
    };

    state.pollTimerId = window.setTimeout(tick, getPollDelay());
  }

  function getPollDelay() {
    if (document.hidden) {
      return 900;
    }

    if (document.hasFocus()) {
      return 120;
    }

    return 260;
  }

  function scheduleScan(delay = 80) {
    if (state.timerId !== null) {
      window.clearTimeout(state.timerId);
    }

    state.timerId = window.setTimeout(() => {
      state.timerId = null;
      scanChunk(true);
    }, delay);
  }

  function scanChunk(force = false) {
    state.scanCount += 1;
    const forceFreshLookup = force || state.scanCount % 5 === 0;
    const nextChunk = findChunk(forceFreshLookup);
    if (!force && nextChunk === state.currentChunk) {
      return;
    }

    state.currentChunk = nextChunk;
    render(force);
  }

  function ensureSyllableWatcher() {
    const element = document.querySelector(".syllable");
    if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
      return;
    }

    if (state.syllableElement === element) {
      return;
    }

    if (state.syllableObserver) {
      state.syllableObserver.disconnect();
    }

    state.syllableElement = element;
    state.lockedChunkElement = element;

    state.syllableObserver = new MutationObserver(() => {
      handleSyllableElementUpdate();
    });

    state.syllableObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    handleSyllableElementUpdate();
  }

  function handleSyllableElementUpdate() {
    const element = state.syllableElement;
    if (!(element instanceof HTMLElement) || !element.isConnected) {
      return;
    }

    const chunk = sanitizeChunk(element.textContent) || bestChunkToken(element.textContent);
    if (!chunk) {
      return;
    }

    state.mutationCandidate = {
      chunk,
      score: 14,
      element,
      at: Date.now()
    };

    if (chunk !== state.currentChunk) {
      state.currentChunk = chunk;
      render(true);
    }
  }

  function captureUsedWords(records) {
    for (const record of records) {
      if (record.type !== "childList") {
        continue;
      }

      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        for (const word of extractPlayedWords(node)) {
          state.usedWords.add(word);
        }
      }
    }

    if (state.usedWords.size > 4000) {
      state.usedWords = new Set(Array.from(state.usedWords).slice(-2500));
    }
  }

  function extractPlayedWords(root) {
    const found = new Set();
    const nodes = [root, ...root.querySelectorAll("[class]")];

    for (const node of nodes) {
      const cls = String(node.className || "").toLowerCase();
      const isWordLikeClass = cls.includes("word") && !cls.includes("words");
      if (!isWordLikeClass) {
        continue;
      }

      const tokens = String(node.textContent || "").toLowerCase().match(/[a-z][a-z'-]{1,30}/g) || [];
      for (const token of tokens) {
        const clean = sanitizePlayedWord(token);
        if (clean) {
          found.add(clean);
        }
      }
    }

    return found;
  }

  function sanitizePlayedWord(token) {
    const clean = token.replace(/[^a-z'-]/g, "").toLowerCase();
    if (!/^[a-z][a-z'-]{1,30}$/.test(clean)) {
      return "";
    }
    return clean;
  }

  function findChunk(forceFreshLookup = false) {
    const lockedCandidate = forceFreshLookup ? null : readLockedChunkCandidate();
    const mutationCandidate = readMutationCandidate();
    const networkCandidate = readNetworkCandidate();

    const directCandidate = findDirectElementCandidate();
    const fallbackCandidate = findBestTextCandidate();

    const freshWinner = pickBestCandidate([directCandidate, fallbackCandidate]);
    const winner = pickBestCandidate([networkCandidate, mutationCandidate, lockedCandidate, freshWinner]);

    if (!winner) {
      state.lockedChunkElement = null;
      state.lockMisses = 0;
      return "";
    }

    if (winner.element instanceof HTMLElement) {
      state.lockedChunkElement = winner.element;
      state.lockMisses = 0;
    } else {
      state.lockMisses += 1;
      if (state.lockMisses > 4) {
        state.lockedChunkElement = null;
      }
    }

    return winner.chunk;
  }

  function readMutationCandidate() {
    if (!state.mutationCandidate) {
      return null;
    }

    if (Date.now() - state.mutationCandidate.at > 2200) {
      state.mutationCandidate = null;
      return null;
    }

    return state.mutationCandidate;
  }

  function readNetworkCandidate() {
    if (!state.networkCandidate) {
      return null;
    }

    if (Date.now() - state.networkCandidate.at > 2800) {
      state.networkCandidate = null;
      return null;
    }

    return state.networkCandidate;
  }

  function startNetworkHooks() {
    if (!window.__jkmlHelperBridgeListenerBound) {
      window.addEventListener("message", onBridgeMessage);
      window.__jkmlHelperBridgeListenerBound = true;
    }

    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
      return;
    }

    if (document.getElementById("jkml-helper-page-bridge")) {
      return;
    }

    const script = document.createElement("script");
    script.id = "jkml-helper-page-bridge";
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.async = false;

    const target = document.head || document.documentElement;
    target.appendChild(script);
    script.remove();
  }

  function onBridgeMessage(event) {
    if (event.source !== window || !event.data || typeof event.data !== "object") {
      return;
    }

    if (event.data.source !== "jkml-helper-bridge" || event.data.type !== "chunk") {
      return;
    }

    const chunk = sanitizeChunk(event.data.chunk);
    if (!chunk) {
      return;
    }

    const score = Number(event.data.score);

    state.networkCandidate = {
      chunk,
      score: Number.isFinite(score) ? score : 10,
      element: null,
      at: Date.now()
    };

    scheduleScan(5);
  }

  function waitForBody() {
    if (document.body) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const onReady = () => {
        if (document.body) {
          document.removeEventListener("DOMContentLoaded", onReady);
          resolve();
        }
      };

      document.addEventListener("DOMContentLoaded", onReady);
    });
  }

  function captureMutationCandidate(records) {
    let best = null;

    for (const record of records) {
      const candidate = getCandidateFromMutation(record);
      if (!candidate) {
        continue;
      }

      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }

    if (best) {
      state.mutationCandidate = {
        chunk: best.chunk,
        score: best.score + 3,
        element: best.element,
        at: Date.now()
      };
    }
  }

  function getCandidateFromMutation(record) {
    if (record.type === "characterData") {
      const element = record.target.parentElement;
      if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
        return null;
      }
      const chunk = sanitizeChunk(record.target.nodeValue) || bestChunkToken(record.target.nodeValue);
      if (!chunk) {
        return null;
      }
      return { chunk, score: scoreCandidate(element, chunk), element };
    }

    if (record.type === "attributes") {
      const element = record.target;
      if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
        return null;
      }

      const values = [element.textContent || ""];
      if (record.attributeName) {
        values.push(element.getAttribute(record.attributeName) || "");
      }

      for (const value of values) {
        const chunk = sanitizeChunk(value) || bestChunkToken(value);
        if (chunk) {
          return { chunk, score: scoreCandidate(element, chunk), element };
        }
      }

      return null;
    }

    if (record.type === "childList") {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        const element = node;
        if (!isElementVisible(element)) {
          continue;
        }

        const chunk = sanitizeChunk(element.textContent) || bestChunkToken(element.textContent);
        if (!chunk) {
          continue;
        }

        return { chunk, score: scoreCandidate(element, chunk), element };
      }
    }

    return null;
  }

  function bestChunkToken(text) {
    if (!text) {
      return "";
    }

    const matches = text.toLowerCase().match(/[a-z]{1,4}/g);
    if (!matches || matches.length === 0) {
      return "";
    }

    matches.sort((a, b) => b.length - a.length);
    for (const token of matches) {
      if (/^[a-z]{1,4}$/.test(token)) {
        return token;
      }
    }

    return "";
  }

  function pickBestCandidate(candidates) {
    const valid = candidates.filter(Boolean);
    if (valid.length === 0) {
      return null;
    }
    valid.sort((a, b) => b.score - a.score);
    return valid[0];
  }

  function readLockedChunkCandidate() {
    const element = state.lockedChunkElement;
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    if (!element.isConnected || !isElementVisible(element)) {
      return null;
    }

    const chunk = sanitizeChunk(element.textContent);
    if (!chunk) {
      return null;
    }

    return {
      chunk,
      score: scoreCandidate(element, chunk) + 2.3,
      element
    };
  }

  function findDirectElementCandidate() {
    const exactSyllable = readExactSyllableCandidate();
    if (exactSyllable) {
      return exactSyllable;
    }

    const selectors = [
      "[class*='syll']",
      "[class*='chunk']",
      "[class*='letter']",
      "[class*='prompt']",
      "[class*='bomb']"
    ];

    const candidates = [];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || !isElementVisible(node)) {
          continue;
        }

        const text = sanitizeChunk(node.textContent);
        if (text) {
          const score = scoreCandidate(node, text) + 0.9;
          candidates.push({ chunk: text, score, element: node });
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  function readExactSyllableCandidate() {
    const element = document.querySelector(".syllable");
    if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
      return null;
    }

    const chunk = sanitizeChunk(element.textContent) || bestChunkToken(element.textContent);
    if (!chunk) {
      return null;
    }

    return {
      chunk,
      score: scoreCandidate(element, chunk) + 5,
      element
    };
  }

  function findBestTextCandidate() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const candidates = [];
    let node;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || !isElementVisible(parent)) {
        continue;
      }

      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
        continue;
      }

      const chunk = sanitizeChunk(node.nodeValue);
      if (!chunk) {
        continue;
      }

      const score = scoreCandidate(parent, chunk);
      if (score <= 0) {
        continue;
      }

      candidates.push({ chunk, score, element: parent });
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  function sanitizeChunk(text) {
    if (!text) {
      return "";
    }

    const value = text.trim().toLowerCase();
    if (!/^[a-z]{1,4}$/.test(value)) {
      return "";
    }

    return value;
  }

  function isElementVisible(element) {
    const styles = getComputedStyle(element);
    if (styles.display === "none" || styles.visibility === "hidden" || Number(styles.opacity) === 0) {
      return false;
    }

    if (element.closest("#jkml-helper-panel")) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
  }

  function scoreCandidate(element, chunk) {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = Math.abs(cx - window.innerWidth / 2) / window.innerWidth;
    const dy = Math.abs(cy - window.innerHeight / 2) / window.innerHeight;
    const centerWeight = 1.35 - dx - dy;

    let zoneWeight = 0;
    if (cx > window.innerWidth * 0.15 && cx < window.innerWidth * 0.85) {
      zoneWeight += 0.25;
    }
    if (cy > window.innerHeight * 0.15 && cy < window.innerHeight * 0.85) {
      zoneWeight += 0.25;
    }
    if (cy > window.innerHeight * 0.12 && cy < window.innerHeight * 0.65) {
      zoneWeight += 0.35;
    }

    const styles = getComputedStyle(element);
    const fontSize = Number.parseFloat(styles.fontSize) || 12;
    const sizeWeight = Math.min(fontSize / 24, 2);

    let classWeight = 0;
    const cls = element.className.toString().toLowerCase();
    if (cls.includes("syll") || cls.includes("chunk")) {
      classWeight += 2.2;
    }
    if (cls.includes("bomb") || cls.includes("prompt")) {
      classWeight += 1.4;
    }

    let lengthWeight = 0;
    if (chunk.length === 2 || chunk.length === 3) {
      lengthWeight += 0.5;
    } else if (chunk.length === 1) {
      lengthWeight += 0.15;
    }

    let contextPenalty = 0;
    const container = element.closest("[class]");
    if (container) {
      const names = container.className.toString().toLowerCase();
      if (/(chat|log|stats|table|settings|sidebar|history|score)/.test(names)) {
        contextPenalty -= 1.2;
      }
      if (/(timer|time|round|room|nickname|player|author)/.test(names)) {
        contextPenalty -= 0.8;
      }
    }

    return centerWeight + zoneWeight + sizeWeight + classWeight + lengthWeight + contextPenalty;
  }

  function getSuggestions(chunk) {
    if (!chunk) {
      return [];
    }

    const minWordLength = Number(state.settings.minWordLength) || DEFAULT_SETTINGS.minWordLength;
    const maxSuggestions = Number(state.settings.maxSuggestions) || DEFAULT_SETTINGS.maxSuggestions;
    const needle = chunk.toLowerCase();

    let pool = state.words;

    if (needle.length === 2 && state.index2.has(needle)) {
      pool = state.index2.get(needle);
    } else if (needle.length === 3 && state.index3.has(needle)) {
      pool = state.index3.get(needle);
    }

    return pool
      .filter((word) => {
        if (word.length < minWordLength || !word.includes(needle)) {
          return false;
        }
        if (!state.settings.filterUsedWords) {
          return true;
        }
        return !state.usedWords.has(word);
      })
      .sort((a, b) => {
        const lenDiff = a.length - b.length;
        if (lenDiff !== 0) {
          return lenDiff;
        }
        return a.localeCompare(b);
      })
      .slice(0, maxSuggestions);
  }

  function render(force = false) {
    if (!state.panel || !state.chunkValue || !state.statusValue || !state.list) {
      return;
    }

    if (!state.settings.panelVisible) {
      state.panel.dataset.hidden = "true";
      return;
    }

    if (!state.settings.enabled) {
      state.panel.dataset.hidden = "false";
      state.chunkValue.textContent = "--";
      state.statusValue.textContent = "Paused";
      state.list.replaceChildren(makeListItem("Helper is disabled in settings."));
      return;
    }

    if (!state.loaded) {
      state.panel.dataset.hidden = "false";
      state.chunkValue.textContent = "--";
      state.statusValue.textContent = "Loading";
      state.list.replaceChildren(makeListItem("Loading dictionary..."));
      return;
    }

    if (!state.currentChunk) {
      if (!force && state.lastRenderedChunk === "") {
        return;
      }
      state.lastRenderedChunk = "";
      state.panel.dataset.hidden = "false";
      state.chunkValue.textContent = "--";
      state.statusValue.textContent = "Waiting";
      state.list.replaceChildren(makeListItem("Waiting for current chunk..."));
      return;
    }

    if (!force && state.currentChunk === state.lastRenderedChunk) {
      return;
    }

    state.lastRenderedChunk = state.currentChunk;

    const suggestions = getSuggestions(state.currentChunk);

    state.panel.dataset.hidden = "false";
    state.chunkValue.textContent = state.currentChunk;
    state.statusValue.textContent = `${suggestions.length} results`;

    if (suggestions.length === 0) {
      state.list.replaceChildren(makeListItem("No matches in dictionary."));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const word of suggestions) {
      const li = document.createElement("li");
      li.textContent = word;
      li.title = "Click to copy";
      li.addEventListener("click", () => {
        copyText(word)
          .then(() => {
            state.statusValue.textContent = `Copied: ${word}`;
          })
          .catch(() => {
            state.statusValue.textContent = "Copy failed";
          });
      });
      fragment.appendChild(li);
    }

    state.list.replaceChildren(fragment);
  }

  function makeListItem(text) {
    const li = document.createElement("li");
    li.textContent = text;
    li.style.cursor = "default";
    return li;
  }

  async function copyText(text) {
    if (canUseAsyncClipboard()) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // Fall back to execCommand when clipboard-write is blocked in iframe.
      }
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(ta);

    if (!ok) {
      throw new Error("execCommand copy failed");
    }
  }

  function canUseAsyncClipboard() {
    if (!navigator.clipboard || !window.isSecureContext) {
      return false;
    }

    const policy = document.permissionsPolicy || document.featurePolicy;
    if (!policy || typeof policy.allowsFeature !== "function") {
      return true;
    }

    try {
      return policy.allowsFeature("clipboard-write");
    } catch (error) {
      return false;
    }
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
})();
