# Cube World

A browser-based emulator tribute to Radica / Mattel **Cube World** (2005–2009) — the tiny handheld toy where stick figures live on a 32×32 monochrome LCD, one character per cube. Snap cubes together and the characters wake up, wave, and walk between screens.

This is a fan-made recreation: the LCD look, the traced stick-figure sprites, and the character behaviours are modelled on the real toy. It is **not affiliated with or endorsed by Mattel / Radica**.

## Run it

It's a static site — no build step. Serve the folder with any static server, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Use it

The whole screen is the sandbox.

- **+ Cube** — add a cube (as many as you like; the grid grows and scrolls).
- **Drag** a cube so a magnetic side snaps against another — the characters connect and walk between them. Pull a connected cube away and everyone dissolves home.
- **Click** a cube to coax out its character's signature trick.
- **Shake** — makes everyone dizzy.
- **Sound** — toggle audio.
- **Reset** — clear the sandbox.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell — the sandbox canvas and control bar. |
| `style.css` | Flat dark sandbox UI. |
| `main.js` | Emulator engine: cubes, characters, LCD rendering, AI, input. |
| `data.js` | Constants and content — the character roster, tricks, LCD palette. |
| `sprites.js` | Traced stick-figure sprite frames. |
| `reference/` | Research notes, spec, and traced spritesheets used to build it. |

## Credits

Fan-made tribute to Radica / Mattel **Cube World**. All trademarks belong to their respective owners.
