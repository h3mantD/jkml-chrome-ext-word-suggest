# JKLM BombParty Helper (Chrome Extension)

This extension shows quick word suggestions for the current BombParty chunk.

## What it does

- Detects the active BombParty chunk in the `falcon.jklm.fun` game frame.
- Matches words from a local dictionary (`data/words.txt`).
- Shows suggestions in a floating panel.
- Lets you configure settings from the extension popup.
- Keeps the panel hidden by default for safer screen sharing.

## Files

- `manifest.json` - Extension config (MV3).
- `content.js` - Chunk detection, dictionary search, floating UI.
- `popup.html`, `popup.css`, `popup.js` - Settings UI.
- `data/words.txt` - Starter dictionary.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`jkml-chrome-ext`).
5. Open `https://jklm.fun` and join BombParty.

## Usage

- Open the extension popup to change:
  - enable/disable helper
  - show/hide panel on page
  - max suggestions
  - minimum word length
- Keyboard shortcuts:
  - `Ctrl+Shift+J` -> show/hide panel
  - `Ctrl+Shift+K` -> force-refresh chunk detection and suggestions
  - `Esc` -> panic hide panel instantly
- Click a suggested word to copy it.

## Notes

- BombParty runs inside an iframe (`https://falcon.jklm.fun/games/bombparty`), so host permissions include both domains.
- The chunk detector uses resilient fallback logic because JKLM classes can change.
- Copy uses async clipboard when allowed, and automatically falls back to `execCommand("copy")` when iframe permissions policy blocks Clipboard API.
- You can replace `data/words.txt` with a larger custom dictionary (one word per line).

## Troubleshooting

- If updates seem stuck when letters change, press `Ctrl+Shift+K` for manual refresh.
- If copy fails, click again after focusing the game tab; the fallback copy path should still work in restricted iframe contexts.
- After changing extension files, always reload the extension in `chrome://extensions` and refresh the JKLM tab.
