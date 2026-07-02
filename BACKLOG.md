# Cube World — Development Backlog

This file drives autonomous iteration. Each loop iteration: pick the topmost
unchecked item, implement it completely, verify it, log it, commit it.

## Guardrails (non-negotiable, apply to every item)

- **Authenticity**: 32×32 monochrome dot-matrix LCD, black stick figures, NO
  scenery on regular cubes (jumbo scene cubes are the only exception), all
  screen-visible motion quantized to the LCD tick. Grey-green STN palette.
- **Copyright boundary**: we reproduce game/screen BEHAVIOR with the real
  traced body poses plus our OWN procedural props and layouts. Never
  pixel-duplicate the toy's proprietary game artwork, even if it would look
  "more exact".
- **No build step, no dependencies, no network calls.** The site stays five
  static files. (Exception: P4.4 may use same-origin BroadcastChannel.)
- **Don't regress the core loop**: connect → wave → transfer → blind →
  dissolve must keep passing; `window.__cw` debug hooks stay live.
- **Cache busters**: bump `?v=N` in index.html for every file you edit.

## Loop protocol (one iteration)

1. Read this file. Pick the topmost `[ ]` item (or resume a `[~]` in-progress
   item). Mark it `[~]`.
2. Implement the smallest slice that fully satisfies the acceptance criteria.
3. Verify with the preview tools:
   - `preview_start` (config `cubeworld-static`), reload page.
   - `__cw.selftest()` returns `{ pass: true }` (after P0.1 lands).
   - Feature-specific checks from the item's acceptance criteria — use
     `__cw.ff(n)` to fast-forward ticks, `__cw.planeAscii(i)` to inspect LCDs.
   - Console has no errors. Take a screenshot for the record.
4. Mark the item `[x]`, append an entry to DEVLOG.md (date, item, what
   changed, how verified, new cache version).
5. Commit — one item, one commit — on this branch.
6. At the end of each phase: push the branch and open/update a PR to main.
7. If an item fails verification twice, mark it `[!]` with a note in
   DEVLOG.md and move to the next item. Never leave the tree broken: revert
   uncommitted work that doesn't pass.

---

## Phase 0 — Loop infrastructure

- [x] **P0.1 In-page selftest** — Add `__cw.selftest()` to main.js: returns
  `{ pass, failures: [] }` checking (a) connections are symmetric and edges
  flush, (b) every character's `home`/current cube ids resolve, (c) every
  figure x within lane bounds 5..27 when settled, (d) no NaN/undefined in any
  cube/char numeric field, (e) composing a cube's plane twice in the same tick
  is bit-identical, (f) door values within 0..1, (g) ≤4 occupants per cube.
  *Accept: selftest passes on a fresh 4-cube world, after `__cw.ff(200)`, and
  after a scripted connect + transfer + disconnect sequence.*
- [x] **P0.2 Persistence** — Save sandbox to localStorage (debounced on
  change): cube positions, roster assignment, housing colors; restore on load.
  `?fresh=1` URL param skips restore; Reset clears the save. Version the
  schema (`cw_save_v1`).
  *Accept: reload restores the same layout + characters; `?fresh=1` gives a
  new random world; Reset then reload gives a new world; selftest passes
  after restore.*
- [x] **P0.3 Devlog seeded** — DEVLOG.md exists and the loop appends to it
  every iteration (this item is done when the first real entry lands).

## Phase 1 — Playable mini-games (flagship)

The real toy's heart: every character has a built-in 3-button game. We build
the game engine and cover the whole roster with our own LCD art.

- [x] **P1.1 Game engine core** — `cube.game` state machine entered/exited
  via deck button 0: countdown (3-2-1 on LCD), play, game-over. A 3×5 LCD
  digit font for score, rendered on the plane. A reusable "timing press"
  primitive (moving object + press window + hit/miss judgment). Miss = trip/
  tumble pose; 3 misses = game over, best-score toast on the bezel. Buttons 1
  and 2 are game inputs while in game mode.
  *Accept: any character can enter game mode, score at least 1 point via a
  scripted button press at the right tick, miss on a wrong-tick press, and
  reach game-over; screen stays 32×32 authentic; selftest passes during and
  after a game.*
- [x] **P1.2 Timing-game batch** — Implement with the P1.1 primitive:
  jump-rope (Whip: rope sweeps under feet, press to hop, speeds up), batting
  (Slugger: pitch approaches, press to swing, ball flies off), header
  (Dodger: ball drops from varying x, press when overhead).
  *Accept: each game playable to ≥5 points via scripted presses; distinct
  props; speed ramps; misses animate.*
- [x] **P1.3 Aim/sequence batch** — Fire hose (Sparky: flames pop up at
  three heights, btn1 cycles aim, btn0 sprays), snake charmer (Dart: the
  snake rises in a 2–4 step button pattern to mimic; wrong = snake ducks),
  rocket hover (Sci-Fi: btn0 thrusts against gravity through scrolling gaps).
  *Accept: each playable and losable via scripted inputs; selftest passes.*
- [x] **P1.4 High scores** — Per-character best score persisted with P0.2
  storage; shown on the game-over toast and in the album (P3.1) later.
  *Accept: beat a score, reload, best survives.*
- [x] **P1.5 Full roster coverage** — Map every remaining roster character to
  the nearest primitive (timing / aim / sequence / hover) with its own prop
  set from its documented game, so every character is playable.
  *Accept: iterate the whole ROSTER in a script: every char enters game mode
  and scores; no console errors.*

## Phase 2 — Physical toy feel

- [ ] **P2.1 Cube rotation** — Rotate a cube 90° via a hover chip (↻) or the
  R key while dragging. Housing animates the turn (smooth, it's physical);
  the LCD plane contents rotate 90° (instant, it's LCD); the figure tumbles
  to the new floor and is briefly dizzy; connections recompute for the new
  edge geometry.
  *Accept: rotating a connected cube breaks/reforms connections correctly;
  figure ends standing on the new down; selftest passes after 4 rotations.*
- [ ] **P2.2 Sound pass** — Chirp motifs via the existing beep()/audio path:
  boot jingle (rising 3-note), connect chime, door tick, transfer whistle,
  game blips + success fanfare + miss buzz, dizzy warble, sleep descend.
  Respect the mute toggle; nothing plays before first user gesture.
  *Accept: each event routes to a distinct motif (verifiable via a
  `__cw.lastSounds` ring buffer); mute silences all.*
- [ ] **P2.3 Group behaviors** — With ≥3 linked cubes: occasional "gather"
  (all figures migrate to one cube, synchronized wave, then disperse home),
  follow-the-leader chain transfers, and pairwise "play together" (two
  co-occupants mirror each other's animation).
  *Accept: force each behavior via a debug hook; doorway pairBusy rules
  hold (no two figures in one doorway); dissolve still works mid-gather.*
- [ ] **P2.4 Drag tilt feel** — While a cube is dragged, its figure stumbles
  opposite the drag direction (tilt-sensor feel) and wobbles on drop.
  *Accept: drag left → figure slides/stumbles right, quantized to ticks;
  settles to lane after drop; selftest passes.*

## Phase 3 — Collection & showcase

- [ ] **P3.1 Collector's album** — A backer-card-styled overlay (button in
  the control bar): full roster grid; characters you've spawned show their
  traced idle sprite + name + series badge, unseen ones are black
  silhouettes; a star marks "trick seen", a digit shows best game score.
  Persisted via P0.2 storage.
  *Accept: fresh world shows spawned chars unlocked, others silhouetted;
  state survives reload; album scrolls with 22+ entries; Esc/click closes.*
- [ ] **P3.2 Attract mode** — After 90s without input (or via a control-bar
  button): auto-arrange 16 cubes into 4×4, run a choreographed demo — mass
  boot, wave chain, gather party, mass sleep — looping until any input, then
  restore the user's previous layout.
  *Accept: demo runs without console errors for 3 full loops under `ff`;
  input exits and restores prior cube positions exactly.*
- [ ] **P3.3 Photo & GIF export** — Control-bar camera button saves a PNG of
  the sandbox. Per-cube: a hover chip exports an animated GIF of that cube's
  32×32 LCD (last ~4 seconds, upscaled ×6, hand-rolled GIF89a encoder — the
  LCD is 2-color so an uncompressed/minimal-LZW encoder is fine, no deps).
  *Accept: PNG downloads and matches the canvas; GIF opens in a browser tab
  and animates; both stay under a few hundred KB.*

## Phase 4 — Reach & robustness

- [ ] **P4.1 Touch & mobile** — Responsive control bar, touch drag without
  page scroll (touch-action/preventDefault), devicemotion → shake, bigger
  hit targets for chips/buttons on coarse pointers.
  *Accept: at 390×844 the bar fits and cubes drag under emulated touch;
  no page scroll during drag.*
- [ ] **P4.2 Performance @ 50 cubes** — Profile; recompose planes only on
  tick boundaries (verify), skip ghost-decay work for settled-blank screens,
  keep 60fps housing layer with 50 cubes on a laptop.
  *Accept: with 50 cubes and `ff` stress, frame time stays under ~8ms in a
  quick performance.now() sample; no visual regressions (screenshot).*
- [ ] **P4.3 Battery easter egg** — After long uptime a random cube dims and
  shows a low-battery glyph (own art); press-and-hold its deck for 1s to
  "swap the battery": screen off → boot maze → back. Rare, charming, off by
  default until uptime threshold.
  *Accept: trigger via debug hook; dim → swap → boot sequence plays;
  selftest passes.*
- [ ] **P4.4 Two-tab link (stretch)** — A "LINK" toggle adds a dock edge at
  the sandbox border; two tabs of the same browser (BroadcastChannel) pair
  docked cubes so characters transfer between tabs, blind/dissolve rules
  intact. No servers, same-origin only.
  *Accept: two tabs side by side: figure walks off tab A, arrives in tab B;
  closing a tab dissolves visitors home in the other.*

---

## Icebox (ideas noted, not scheduled)

- WebRTC cross-machine linking (real "trade with a friend").
- Character mood drift (subtle: sleepy at night via local clock).
- Konami-style hidden characters (own designs, clearly fan-art).
- Screensaver/fullscreen kiosk mode.
