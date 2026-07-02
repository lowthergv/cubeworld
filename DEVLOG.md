# Cube World — Development Log

One entry per loop iteration: date, backlog item, what changed, how it was
verified, cache version after the change. Newest entries at the top.

---

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
