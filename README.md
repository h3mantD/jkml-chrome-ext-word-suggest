# JKLM BombParty Helper (Chrome Extension)

This extension shows quick word suggestions for the current BombParty chunk.

## What it does

- Detects the active BombParty chunk in the `falcon.jklm.fun` game frame.
- Matches words from a local dictionary (`data/words.txt`).
- Shows suggestions in a floating panel.
- Lets you configure settings from the extension popup.

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
- Press `Option+J` in the game to show/hide panel quickly.
- Press `Option+R` in the game to force-refresh chunk detection.
- Press `Esc` to instantly hide the panel (panic hide).
- Click a suggested word to copy it.

## Notes

- BombParty runs inside an iframe (`https://falcon.jklm.fun/games/bombparty`), so host permissions include both domains.
- The chunk detector uses resilient fallback logic because JKLM classes can change.
- You can replace `data/words.txt` with a larger custom dictionary (one word per line).
# jkml-chrome-ext-word-suggest
