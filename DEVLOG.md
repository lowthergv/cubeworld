# Cube World — Development Log

One entry per loop iteration: date, backlog item, what changed, how it was
verified, cache version after the change. Newest entries at the top.

---

- **2026-07-02 · P1.1 Game engine core** — Deck button 0 now starts a real
  interactive game on the cube (button 0 again quits; buttons 1/2 are game
  inputs — btn2 no longer sleeps during a game). `cube.game` state machine:
  countdown (big 3-2-1 in the new 3×5 LCD digit font while the player walks
  to centre) → play → game-over (final score flashes at scale 2, then a
  bezel toast with the character's real game name + best score). The P1.1
  primitive is a timing game: a 2×2 ball closes in from either side; press
  within the ±2-dot window to strike (score++, speed ramps every 3 points);
  wrong-moment presses and unanswered passes are misses (stumble pose);
  3 misses end the game. Presses latch between LCD ticks and are judged on
  the next tick, so gameplay is exactly as chunky as the screen. New state
  `gaming` (tickChar hands the figure to the game engine). Session best
  scores per roster unit (P1.4 persists them). Robustness, all eager so
  selftest never sees a half-dead game: shake quits, dissolve/removal of
  the player quits, dozing off powers the game down, poke can't hijack the
  player, and startGame refuses figures still mid-doorway. Selftest gained
  game↔player linkage checks both directions. `__cw.press` added.
  Verified in-browser (?fresh=1 clean room): enter→countdown→play with the
  player centred; scored 2 via right-tick presses; missed on a wrong-tick
  press; btn2 acted as input without sleeping the cube; ran unanswered to
  game-over; toast "Slam Dunk · 1 PTS · BEST 1"; quit works; shake ends the
  game; a visitor hosts a game on a foreign cube and breaking the link ends
  it and sends them home; big-score LCD render confirmed via planeAscii;
  selftest green at every phase; console clean. Cache: main.js?v=18,
  data.js?v=14 (LCD_DIGITS font). Screenshot note: play-phase ball + pressed
  deck button captured; the game itself finished into 'over' while framing
  the shot — organic proof the full loop runs unattended.

- **2026-07-02 · P0.2 Persistence** — Layout survives reload via
  localStorage `cw_save_v1`: cube positions + roster identity (index into
  ROSTER, so Special Editions / JP variants / jumbos restore exactly).
  Debounced 400ms save on add/remove/drag-end; restore rebuilds cubes at
  saved spots (power-on boot plays, characters start home — like the real
  toy powering back up). `?fresh=1` is a clean room: skips restore AND
  never implicitly saves, so peeking at a fresh world can't clobber the
  saved one. Reset clears the save (with pending-timer cancel). makeCube
  gained an optional def param; `__cw.saveNow` for tests. Verified
  in-browser: exact signature restore (positions/names/series) with a
  flush pair reconnecting; debounce fires without saveNow; fresh world
  differs and leaves the save untouched >400ms later; return from fresh
  restores the original; Reset clears now and stays cleared; post-reset
  reload gives a new 4-cube world; selftest green at every step; console
  clean. Note: restore clamps positions into the current viewport (same
  rule as dragging), so a layout saved in a wider window reflows at the
  right edge. Cache: main.js?v=17.

- **2026-07-02 · P0.1 In-page selftest** (also closes P0.3) — Added
  `__cw.selftest()` to main.js: connection symmetry + flush seams, char
  home/cube resolution, occupant-list ↔ cubeId agreement, position sanity
  (settled idle inside the 5..27 band; portal states bounded), finite
  numerics, anim-frame bounds, door 0..DOOR_STEPS / blind 0..LCD integers,
  ≤MAX_OCCUPANTS, yOff grounded-vs-hatch rules, same-tick plane determinism.
  New debug hooks: `dissolve`, `shakeAll`, `addCube`, `poke`, `findSnap`.
  Making the invariants true surfaced four real bugs, all fixed:
  1. Poking a cube could hijack a figure in state `entering` (x = −4/36) and
     strand it off-screen — pokeCube/pressButton now exclude mid-doorway
     figures.
  2. shakeAll / drag-shake made mid-portal figures dizzy without pulling
     them back inside — they now clamp to x 5..27 and drop the stale phase.
  3. **Occupancy-cap overflow** (found by adversarial review, confirmed by
     two independent repros): dissolveOrphans/removeCube pushed a returning
     resident into its home with no cap check — a home holding 4 guests
     while its resident was two hops away went to 5 occupants when the far
     link broke. New `sendHome()` routes homecomings and cascades guests
     onward to their own homes (terminates: residents are never evicted).
  4. **Same-slot stacking**: findSnap let a dragged cube snap exactly onto
     an occupied slot, making recomputeConnections asymmetric — snap now
     refuses slots another cube already sits in.
  Note: acceptance criterion said "door values within 0..1" but the engine
  stores integer steps 0..DOOR_STEPS(4); the check matches the code. Blind
  gating (blind>0 ⇒ empty+connected) deliberately NOT asserted — it is a
  lagging integrator, not a point-in-time invariant (review refuted 3×).
  Verified in-browser: selftest passes on fresh world / ff(200) / scripted
  connect→transfer→disconnect; 6 injected corruptions each detected then
  clean after restore; shake-mid-cross and poke-mid-entering hold; the
  plus-shape cap repro ends at 4 occupants with everyone seated
  consistently; snap refuses occupied slots but still works on free ones;
  console clean. Cache: main.js?v=16.
