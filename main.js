(function () {
  'use strict';

  // ==========================================================================
  // Radica Cube World — LCD emulator engine
  // ==========================================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const addBtn = document.getElementById('addCubeBtn');
  const shakeBtn = document.getElementById('shakeBtn');
  const muteBtn = document.getElementById('muteBtn');
  const resetBtn = document.getElementById('resetBtn');

  const GAP = 22;
  const SNAP = 30;              // px proximity for a magnetic snap
  const TOL = 2;                // px flush tolerance for a live connection
  // LCD_TICK comes from data.js — every screen-visible change happens in whole
  // ticks (see tickCube). Speeds below are expressed in dots/steps *per tick*.
  const WALK_DOTS = 2;          // horizontal walk speed, dots/tick
  const VWALK_DOTS = 3;         // vertical hatch travel speed, dots/tick
  const DOOR_STEPS = 4;         // door[edge] is an integer 0..DOOR_STEPS
  const BLIND_STEP = 4;         // venetian blind rows revealed/hidden per tick
  const BOOT_TICKS = 13;        // ~2100ms / 160ms
  const BOOT_FLASH_TICKS = 3;   // wake-from-sleep power-flash duration
  const TRICK_TICKS = 17;       // ~2800ms / 160ms
  const GHOST_HALF_LIFE = 90;   // ms — STN pixel-off fade half-life
  const WAVE_LOOPS_GREET = 2;   // full wave loops played during a 'greet' phase

  // Small monochrome LCD emote icons (drawn in ON dots above a character).
  const EMOTES = {
    exclaim: ['010','010','010','000','010'],
    note:    ['00110','00101','00100','01100','11100'],
    heart:   ['01010','11111','11111','01110','00100'],
    zzz:     ['1110','0010','0100','1110'],
  };

  // extra idle-variety loops built from the real traced idle-standing frames
  CW_ANIM.idle2 = [0, 3, 4, 5, 4, 3];
  CW_ANIM.scratch = [0, 6, 7, 6, 0];
  // stand-up: the sit sequence [10..15] played back out to standing idle
  CW_ANIM.stand = [15, 14, 13, 12, 11, 10, 0];

  // ---- shared behaviours every character performs on idle ----------------
  // `anim` is the clip; `loops` = [min,max] repeats before returning to idle
  // (so an action dwells instead of snapping back after one cycle). `hold`
  // sustains a frame for `holdDur` ms after the intro (sit → hold seated),
  // then `stand` plays as the outro. `emote` shows a small icon while acting.
  const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  const BEHAVIORS = {
    lookabout: { anim: 'idle2',   loops: [2, 4] },
    scratch:   { anim: 'scratch', loops: [1, 3] },
    stretch:   { anim: 'stretch', loops: [1, 2] },
    bend:      { anim: 'bend',    loops: [1, 2] },
    wave:      { anim: 'wave',    loops: [2, 3], emote: 'note' },
    sit:       { anim: 'sit', hold: 'sitheld', holdDur: [2600, 6500], stand: 'stand' },
  };
  const IDLE_ACTS = Object.keys(BEHAVIORS);

  let CSS_W = 1000, CSS_H = 600;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  let cubes = [], cubeSeq = 1;
  let chars = [], charSeq = 1;

  let muted = false, audioCtx = null, drag = null, matrixTile = null;
  let last = null;

  // ------------------------------------------------------------- utilities
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b));
  const pick = a => a[(Math.random() * a.length) | 0];
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const cubeById = id => cubes.find(c => c.id === id);
  // step `cur` toward `target` by up to speed*dt, snapping on when it would
  // reach/overshoot — so movement lands cleanly regardless of frame length.
  const toward = (cur, target, speed, dt) => {
    const d = target - cur, step = speed * dt;
    return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
  };

  function shuffled(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ----------------------------------------------------------------- audio
  function ensureAudio() {
    if (!audioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (C) audioCtx = new C(); }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur, delay, vol, type) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol == null ? 0.05 : vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    poke:    () => beep(880, 0.08),
    connect: () => { beep(523, 0.05); beep(659, 0.05, 0.05); beep(784, 0.09, 0.1); },
    transfer:() => { beep(494, 0.05); beep(740, 0.06, 0.05); },
    greet:   () => { beep(660, 0.06); beep(880, 0.08, 0.06); },
    dizzy:   () => { beep(400, 0.1, 0, 0.05, 'sawtooth'); beep(300, 0.12, 0.08, 0.05, 'sawtooth'); },
    add:     () => { beep(587, 0.05); beep(880, 0.08, 0.05); },
    dissolve:() => { beep(700, 0.05); beep(440, 0.08, 0.05); },
    count:   () => beep(587, 0.06),
    hit:     () => { beep(880, 0.05); beep(1175, 0.07, 0.05); },
    miss:    () => beep(220, 0.16, 0, 0.06, 'sawtooth'),
    over:    () => { beep(660, 0.08); beep(494, 0.08, 0.09); beep(330, 0.14, 0.18); },
  };

  // ----------------------------------------------------------- world model
  // Draw characters from a shuffled bag so a session shows varied, non-repeating
  // characters (and surfaces Special Editions) before any repeat.
  let rosterBag = [];
  function nextRoster() { if (!rosterBag.length) rosterBag = shuffled(ROSTER); return rosterBag.pop(); }

  function makeChar(cube, def) {
    const id = charSeq++;
    const ch = {
      id, ident: def, trick: def.trick,
      homeId: cube.id, cubeId: cube.id,
      x: rand(9, 23), lane: 0, laneCount: 1,
      facing: Math.random() < 0.5 ? -1 : 1,
      restAnim: Math.random() < 0.5 ? 'idle' : 'idle2',
      state: 'idle',
      anim: 'idle', frame: 0, oneShot: null,
      act: null,                     // active shared behaviour (sit/wave/…)
      think: irand(4, 13),           // ticks until next idle decision
      emote: null,
      dizzy: 0,                      // ticks remaining
      trickT: 0, trickDur: 0,        // ticks
      transEdge: null, transAxis: 'h', transPhase: null, enterEdge: null,
      yOff: 0,                       // vertical offset while using a hatch
      greetWaves: 0,                 // wave-loop counter during transfer 'greet'
      clamber: false,                // B4: alternates each tick while climbing a hatch
    };
    chars.push(ch);
    cube.occupants.push(ch.id);
    return ch;
  }

  function makeCube(x, y, def) {
    def = def || nextRoster();
    const cube = {
      id: cubeSeq++,
      housing: def,            // full roster def carries colour + identity
      icon: GAME_ICON[def.trick] || 'star',
      scene: def.id === 'global' ? 'beach' : def.id === 'blockbash' ? 'city' : null,
      jumbo: !!def.jumbo,
      x, y,
      conn: { top: null, bottom: null, left: null, right: null },
      occupants: [],
      blind: 0,            // 0 .. LCD rows covered (Venetian blind, integer)
      door: { left: 0, right: 0, top: 0, bottom: 0 },  // 0..DOOR_STEPS per edge
      wiggle: 0,
      idle: 0,             // ms since last interaction (for sleep) — physical-world timer
      asleep: false,
      boot: { t: 0, dur: BOOT_TICKS },   // power-on maze wipe-on animation (ticks)
      toast: null,          // transient "game name" caption chip (ms countdown, smooth UI)
      connFlash: 0,         // ms remaining for the magnetic-latch pulse (physical-world)
      _hover: false,         // B6: pointer currently over this cube
      _pressBtn: -1, _pressT: 0,   // B5: which deck button is pressed, ms remaining
      plane: new Uint8Array(LCD * LCD),
      lum: new Float32Array(LCD * LCD),   // STN ghosting luminance per dot
      _occSig: '',
      tickT: rand(0, LCD_TICK),   // phase-offset so cubes don't tick in lockstep
      ticks: 0,
    };
    cubes.push(cube);
    makeChar(cube, def);
    return cube;
  }

  function occupantsOf(cube) {
    return cube.occupants.map(id => chars.find(c => c.id === id)).filter(Boolean);
  }

  // ---- connection detection (magnetic sides, flush edges) ----
  // B7: flags cube.connFlash on any seam that just newly connected, so the
  // latch chrome can pulse briefly.
  function recomputeConnections() {
    const prev = new Map(cubes.map(c => [c.id, { r: c.conn.right, b: c.conn.bottom }]));
    for (const c of cubes) c.conn = { top: null, bottom: null, left: null, right: null };
    for (let i = 0; i < cubes.length; i++) {
      for (let j = i + 1; j < cubes.length; j++) {
        const A = cubes[i], B = cubes[j];
        const oy = overlap(A.y, A.y + CUBE_SIZE, B.y, B.y + CUBE_SIZE);
        const ox = overlap(A.x, A.x + CUBE_SIZE, B.x, B.x + CUBE_SIZE);
        if (oy >= CUBE_SIZE * 0.85) {
          if (Math.abs((A.x + CUBE_SIZE) - B.x) < TOL) { A.conn.right = B.id; B.conn.left = A.id; }
          else if (Math.abs((B.x + CUBE_SIZE) - A.x) < TOL) { B.conn.right = A.id; A.conn.left = B.id; }
        }
        if (ox >= CUBE_SIZE * 0.85) {
          if (Math.abs((A.y + CUBE_SIZE) - B.y) < TOL) { A.conn.bottom = B.id; B.conn.top = A.id; }
          else if (Math.abs((B.y + CUBE_SIZE) - A.y) < TOL) { B.conn.bottom = A.id; A.conn.top = B.id; }
        }
      }
    }
    for (const c of cubes) {
      const was = prev.get(c.id);
      if (!was) continue;
      if ((c.conn.right && c.conn.right !== was.r) || (c.conn.bottom && c.conn.bottom !== was.b)) c.connFlash = 600;
    }
  }
  const cubeConnected = c => c.conn.top || c.conn.bottom || c.conn.left || c.conn.right;
  function connectionCount() { let n = 0; for (const c of cubes) { if (c.conn.right) n++; if (c.conn.bottom) n++; } return n; }
  function connectedEdges(cube) {
    const e = [];
    for (const k of ['top', 'bottom', 'left', 'right']) if (cube.conn[k]) e.push(k);
    return e;
  }

  // ---- dissolve: any character not in its home cube snaps back ----
  // Route a character back to its own cube and reset it to a settled idle.
  // If the homecoming overfills the cube (its resident returns while four
  // guests are visiting), guests give way — they dissolve onward to their own
  // homes. Terminates: every hop settles one more character at home, and a
  // resident is never evicted from its own cube.
  function sendHome(ch) {
    const cur = cubeById(ch.cubeId), home = cubeById(ch.homeId);
    if (!home) return;
    if (cur && cur !== home) {
      const idx = cur.occupants.indexOf(ch.id);
      if (idx >= 0) cur.occupants.splice(idx, 1);
      if (cur.game && cur.game.charId === ch.id) endGame(cur, false);   // player left the cabinet
    }
    if (!home.occupants.includes(ch.id)) home.occupants.push(ch.id);
    ch.cubeId = ch.homeId;
    ch.state = 'idle'; ch.anim = 'idle'; ch.frame = 0;
    ch.act = null; ch.oneShot = null; ch.yOff = 0; ch.transPhase = null;
    ch.x = rand(9, 23);
    ch.emote = null;
    while (home.occupants.length > MAX_OCCUPANTS) {
      const guest = occupantsOf(home).find(o => o.homeId !== home.id);
      if (!guest) break;
      sendHome(guest);
    }
  }
  function dissolveOrphans() {
    for (const ch of chars) {
      if (ch.cubeId === ch.homeId) continue;
      if (!cubeById(ch.cubeId) || !cubeById(ch.homeId)) continue;
      // still reachable through a live connection? if not, dissolve home.
      if (!pathConnected(ch.cubeId, ch.homeId)) { sendHome(ch); sfx.dissolve(); }
    }
  }
  function pathConnected(aId, bId) {
    if (aId === bId) return true;
    const seen = new Set([aId]); const stack = [aId];
    while (stack.length) {
      const c = cubeById(stack.pop());
      for (const k of ['top', 'bottom', 'left', 'right']) {
        const n = c.conn[k];
        if (n && !seen.has(n)) { if (n === bId) return true; seen.add(n); stack.push(n); }
      }
    }
    return false;
  }

  // ------------------------------------------------------------- placement
  function findSpot() {
    // Auto-tile into a grid that grows downward — cubes are unlimited, so the
    // sandbox scrolls once a row runs past the viewport.
    const cols = Math.max(1, Math.floor((CSS_W - GAP) / (CUBE_SIZE + GAP)));
    for (let r = 0; r < 400; r++) {
      for (let c = 0; c < cols; c++) {
        const x = GAP + c * (CUBE_SIZE + GAP), y = GAP + r * (CUBE_SIZE + GAP);
        const free = cubes.every(k => !(x < k.x + CUBE_SIZE + 8 && x + CUBE_SIZE + 8 > k.x &&
          y < k.y + CUBE_SIZE + 8 && y + CUBE_SIZE + 8 > k.y));
        if (free) return { x, y };
      }
    }
    return null;
  }
  function addCube() {
    const spot = findSpot();
    if (!spot) return null;
    // C3: scatter like real toys on a table, not a spreadsheet grid — jitter
    // is applied after the collision-free grid spot is found (GAP=22 is well
    // clear of the +-10px jitter, so cubes never actually overlap).
    const jx = clamp(spot.x + rand(-10, 10), 0, Math.max(0, CSS_W - CUBE_SIZE));
    const jy = Math.max(0, spot.y + rand(-10, 10));
    const cube = makeCube(jx, jy);
    recomputeConnections();
    resize();          // grow the sandbox if the grid pushed past the viewport
    markDirty();
    return cube;
  }
  function initWorld() { for (let i = 0; i < 4; i++) addCube(); }

  // ---------------------------------------------------- persistence (P0.2)
  // The layout (cube positions + which roster unit each one is) survives a
  // reload; character moment-to-moment state does not — the toys power back
  // on at home, which is what the real cubes do. ?fresh=1 skips the save.
  const SAVE_KEY = 'cw_save_v1';
  const FRESH = new URLSearchParams(location.search).get('fresh') === '1';
  let saveT = null;
  function saveWorld() {
    saveT = null;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        cubes: cubes.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), r: ROSTER.indexOf(c.housing) })),
      }));
    } catch (e) { /* storage unavailable (private mode) — play without saves */ }
  }
  // ?fresh=1 is a clean room: it never implicitly overwrites the saved world
  // (only an explicit __cw.saveNow() does).
  function markDirty() { if (FRESH) return; if (saveT) clearTimeout(saveT); saveT = setTimeout(saveWorld, 400); }
  function clearSave() {
    if (saveT) { clearTimeout(saveT); saveT = null; }
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }
  // rebuild the sandbox from a save; false = no/invalid save, caller inits fresh
  function loadWorld() {
    if (FRESH) return false;
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s || s.v !== 1 || !Array.isArray(s.cubes) || !s.cubes.length) return false;
      if (!s.cubes.every(c => Number.isFinite(c.x) && Number.isFinite(c.y) && ROSTER[c.r])) return false;
      for (const c of s.cubes) makeCube(Math.max(0, c.x), Math.max(0, c.y), ROSTER[c.r]);
      recomputeConnections();
      return true;
    } catch (e) { return false; }
  }

  // =========================================================== CHARACTER AI
  function setAnim(ch, name, oneShot) {
    if (ch.anim !== name || oneShot) { ch.anim = name; ch.frame = 0; }
    ch.oneShot = oneShot || null;
  }

  function neighborThrough(cube, edge) { return cube.conn[edge] ? cubeById(cube.conn[edge]) : null; }

  // ---- lane layout so co-occupants never overlap on the 32-wide screen ----
  // Present = occupants not currently walking out. Lanes are keyed by id so a
  // character keeps a stable lane (no index-swap jitter as they cross).
  function presentOccupants(cube) {
    return cube.occupants
      .map(id => chars.find(c => c.id === id))
      .filter(c => c && c.state !== 'transfer');
  }
  function layoutCube(cube) {
    const present = presentOccupants(cube).sort((a, b) => a.id - b.id);
    present.forEach((c, i) => { c.lane = i; c.laneCount = present.length; });
  }
  function laneX(ch) {
    const n = ch.laneCount || 1;
    if (n <= 1) return null;             // solo → free to roam the whole screen
    const lo = 5, hi = 27;               // spread lanes wide across the usable width
    return lo + (hi - lo) * (ch.lane + 0.5) / n;
  }

  // ---- doorway occupancy: a door/hatch is shared by two cubes, so only one
  // character may pass through it at a time (this is what stops figures from
  // crossing through each other mid-transfer) --------------------------------
  function edgeActive(cube, edge) {
    return occupantsOf(cube).some(ch =>
      (ch.state === 'transfer' && ch.transEdge === edge && (ch.transPhase === 'greet' || ch.transPhase === 'cross')) ||
      (ch.state === 'entering' && ch.enterEdge === edge));
  }
  function pairBusy(cube, edge) {
    if (edgeActive(cube, edge)) return true;
    const nb = neighborThrough(cube, edge);
    return !!(nb && edgeActive(nb, OPPOSITE[edge]));
  }

  // start walking a character out through `edge` into the neighbour.
  // Phase 'approach' = walk to the door sill; 'greet' = face the doorway and
  // wave while it swings open (toy spec: cubes wave before crossing); 'cross'
  // = pass through once open.
  function beginTransfer(ch, cube, edge) {
    ch.state = 'transfer';
    ch.transEdge = edge;
    ch.transPhase = 'approach';
    ch.act = null; ch.oneShot = null; ch.yOff = 0; ch.greetWaves = 0;
    setAnim(ch, 'walk');
    if (edge === 'left' || edge === 'right') {
      ch.transAxis = 'h';
      if (edge === 'right') { ch.facing = 1; ch.threshX = LCD - 6; ch.exitX = LCD + 4; }
      else { ch.facing = -1; ch.threshX = 5; ch.exitX = -4; }
    } else {                                   // vertical: rise/drop through a hatch
      ch.transAxis = 'v';
      ch.facing = ch.x < CENTER_X ? 1 : -1;
      ch.vdir = edge === 'top' ? -1 : 1;       // up through the ceiling / down through the floor
      ch.exitYOff = edge === 'top' ? -24 : 16;
    }
    wakeCube(cube);
  }
  function completeTransfer(ch, fromCube, edge) {
    const dest = neighborThrough(fromCube, edge);
    // no room next door → turn around and walk back in through the same door
    if (!dest || dest.occupants.length >= MAX_OCCUPANTS) {
      ch.state = 'entering'; ch.enterEdge = edge; setAnim(ch, 'walk');
      if (ch.transAxis === 'h') { ch.x = ch.exitX; ch.facing = -ch.facing; }
      else { ch.x = CENTER_X; ch.yOff = ch.exitYOff; }
      layoutCube(fromCube);
      const lx0 = laneX(ch); ch.target = (lx0 == null) ? irand(10, 22) : lx0;
      return;
    }
    const fi = fromCube.occupants.indexOf(ch.id);
    if (fi >= 0) fromCube.occupants.splice(fi, 1);
    dest.occupants.push(ch.id);
    ch.cubeId = dest.id;
    const opp = OPPOSITE[edge];
    ch.state = 'entering'; ch.enterEdge = opp; setAnim(ch, 'walk');
    if (ch.transAxis === 'h') {
      ch.yOff = 0;
      if (opp === 'left') { ch.x = -4; ch.facing = 1; }
      else { ch.x = LCD + 4; ch.facing = -1; }
    } else {                                   // enter via the opposite hatch
      ch.x = CENTER_X;
      ch.yOff = opp === 'top' ? -24 : 16;      // drop from the ceiling / rise from the floor
    }
    layoutCube(fromCube); layoutCube(dest);
    const lx = laneX(ch);
    ch.target = (lx == null) ? irand(10, 22) : lx;
    dest.idle = 0; dest.asleep = false;
    sfx.transfer();
  }

  // wake a cube; if it was asleep, play the short B3 power-flash (reuses the
  // boot mechanism with a flash-only, no-maze variant) instead of the full
  // spawn maze-wipe boot.
  function wakeCube(cube) {
    if (cube.asleep) { cube.boot = { t: 0, dur: BOOT_FLASH_TICKS, flash: true }; }
    cube.idle = 0; cube.asleep = false;
  }

  // step `cur` toward `target` by whole dots, one LCD tick at a time — snaps
  // on overshoot so movement always lands cleanly on an integer dot.
  const towardTick = (cur, target, dots) => toward(cur, target, dots, 1);

  // advance one character by exactly one LCD tick. Everything screen-visible
  // (frame, position, state transitions) changes only here — never between
  // ticks — so a cube's plane is bit-identical between tickCube() calls.
  function tickChar(ch, cube) {
    // advance animation frame one step per tick
    const seq0 = CW_ANIM[ch.anim] || CW_ANIM.idle;
    ch.frame++;
    if (ch.frame >= seq0.length) {
      ch.frame = 0;
      if (ch.state === 'acting' && ch.act) onActLoop(ch);        // looped behaviour
      else if (ch.oneShot) { ch.oneShot = null; if (ch.state === 'acting') { ch.state = 'idle'; setAnim(ch, 'idle'); } }
    }

    if (cube.asleep) { setAnim(ch, 'idle'); return; }

    // dizzy overrides
    if (ch.dizzy > 0) {
      ch.dizzy--;
      ch.state = 'dizzy'; setAnim(ch, 'dizzy');
      if (ch.dizzy <= 0) { ch.state = 'idle'; setAnim(ch, 'idle'); }
      return;
    }

    if (ch.state === 'gaming') return;                  // the game engine drives this figure

    if (ch.state === 'transfer') {
      const door = cube.door[ch.transEdge];             // integer 0..DOOR_STEPS
      if (ch.transAxis === 'h') {
        if (ch.transPhase === 'approach') {              // walk to the door sill
          ch.facing = ch.threshX < ch.x ? -1 : 1;
          ch.x = towardTick(ch.x, ch.threshX, WALK_DOTS);
          if (ch.x === ch.threshX) { ch.transPhase = 'greet'; ch.greetWaves = 0; ch.facing = ch.transEdge === 'right' ? 1 : -1; setAnim(ch, 'wave', true); }
        } else if (ch.transPhase === 'greet') {          // face the doorway, wave while it opens
          if (ch.frame === 0 && ch.oneShot == null) {     // clip just wrapped (setAnim above cleared oneShot on wrap)
            ch.greetWaves++;
            if (ch.greetWaves >= WAVE_LOOPS_GREET) ch.transPhase = 'cross';
            else setAnim(ch, 'wave', true);
          }
        } else if (door >= DOOR_STEPS) {                 // step through once fully open
          ch.x += ch.facing * WALK_DOTS;
          if ((ch.facing < 0 && ch.x <= ch.exitX) || (ch.facing > 0 && ch.x >= ch.exitX))
            completeTransfer(ch, cube, ch.transEdge);
        }
      } else {                                          // vertical: centre under the hatch, then rise/drop
        if (ch.transPhase === 'approach') {
          ch.facing = CENTER_X < ch.x ? -1 : 1;
          ch.x = towardTick(ch.x, CENTER_X, WALK_DOTS);
          if (ch.x === CENTER_X) { ch.transPhase = 'greet'; ch.greetWaves = 0; setAnim(ch, 'wave', true); }
        } else if (ch.transPhase === 'greet') {
          if (ch.frame === 0 && ch.oneShot == null) {
            ch.greetWaves++;
            if (ch.greetWaves >= WAVE_LOOPS_GREET) ch.transPhase = 'cross';
            else setAnim(ch, 'wave', true);
          }
        } else if (door >= DOOR_STEPS) {
          ch.clamber = !ch.clamber;                    // B4: clambering, not levitating
          ch.yOff += ch.vdir * VWALK_DOTS;
          if ((ch.vdir < 0 && ch.yOff <= ch.exitYOff) || (ch.vdir > 0 && ch.yOff >= ch.exitYOff))
            completeTransfer(ch, cube, ch.transEdge);
        }
      }
      return;
    }
    if (ch.state === 'entering') {
      if (ch.transAxis === 'v' && ch.yOff !== 0) {           // settle onto the floor first
        // B4: clambering — alternate arms-up pose (frame 21) with the walk frame,
        // one flip per tick, so it reads as climbing rather than levitating.
        ch.clamber = !ch.clamber;
        ch.yOff = towardTick(ch.yOff, 0, VWALK_DOTS);
        return;
      }
      ch.yOff = 0;
      ch.facing = ch.target < ch.x ? -1 : 1;
      ch.x = towardTick(ch.x, ch.target, WALK_DOTS);
      if (ch.x === ch.target) {
        ch.state = 'idle'; setAnim(ch, 'idle'); ch.think = irand(4, 14);
        greetArrival(ch, cube);
      }
      return;
    }
    if (ch.state === 'walking') {
      ch.facing = ch.target < ch.x ? -1 : 1;
      ch.x = towardTick(ch.x, ch.target, WALK_DOTS);
      if (ch.x === ch.target) { ch.state = 'idle'; setAnim(ch, 'idle'); ch.think = irand(4, 14); }
      return;
    }
    if (ch.state === 'acting') {                    // a looped behaviour (sit/wave/…)
      const a = ch.act;
      if (a && a.phase === 'hold') {                // sustain the pose (e.g. stay seated)
        a.holdT--;
        if (a.holdT <= 0) {
          const b = BEHAVIORS[a.key];
          if (b.stand) { a.phase = 'stand'; setAnim(ch, b.stand, true); }
          else finishAct(ch);
        }
      }
      return;
    }
    if (ch.state === 'interacting') { ch.think--; if (ch.think <= 0) { ch.state = 'idle'; setAnim(ch, 'idle'); ch.emote = null; } return; }
    if (ch.state === 'trick') {                     // performing signature move
      ch.trickT++;
      if (ch.trickT >= ch.trickDur) { ch.state = 'idle'; setAnim(ch, 'idle'); }
      return;
    }

    // ---- idle ----
    ch.state = 'idle';
    // settle into assigned lane when sharing a screen (prevents overlap)
    const lx = laneX(ch);
    if (lx != null && Math.abs(ch.x - lx) > 0.6) {
      ch.facing = ch.x < lx ? 1 : -1;
      ch.x = towardTick(ch.x, lx, WALK_DOTS);
      setAnim(ch, 'walk');
      return;
    }
    if (ch.anim === 'walk') setAnim(ch, ch.restAnim);

    ch.think--;
    if (ch.think > 0) return;
    ch.think = irand(2, 8);                          // real figures act almost constantly

    const edges = connectedEdges(cube);
    const solo = lx == null;
    const roll = Math.random();
    // the real cubes are usually mid-game: a solo character plays its game often
    const gameChance = solo ? 0.5 : 0.2;
    if (TRICKS[ch.trick] && roll < gameChance) { startTrick(ch, cube); return; }
    if (edges.length && roll < gameChance + 0.12) {
      // only take a door that isn't already in use (prevents crossing figures)
      const open = edges.filter(e => {
        const n = neighborThrough(cube, e);
        return n && n.occupants.length < MAX_OCCUPANTS && !pairBusy(cube, e);
      });
      if (open.length) { beginTransfer(ch, cube, pick(open)); return; }
    }
    if (roll < gameChance + 0.30) {                // step / short stroll (in place if sharing)
      const home = solo ? irand(6, 26) : lx;
      ch.state = 'walking'; ch.target = clamp(Math.round(home + rand(-4, 4)), 5, 27);
      setAnim(ch, 'walk');
      return;
    }
    startAct(ch, pick(IDLE_ACTS));                 // shared looping behaviour
  }

  // B2: when a character finishes 'entering' a cube that already has other
  // present occupants, the nearest resident (if free) turns to greet them —
  // both wave once with a heart/note emote on the visitor.
  function greetArrival(ch, cube) {
    const others = occupantsOf(cube).filter(o => o.id !== ch.id && (o.state === 'idle' || (o.state === 'acting' && !o.act)));
    if (!others.length) return;
    let nearest = others[0], best = Math.abs(others[0].x - ch.x);
    for (const o of others) { const d = Math.abs(o.x - ch.x); if (d < best) { best = d; nearest = o; } }
    nearest.act = null; nearest.oneShot = null;
    nearest.facing = ch.x >= nearest.x ? 1 : -1;
    ch.facing = nearest.x >= ch.x ? 1 : -1;
    nearest.state = ch.state = 'interacting';
    setAnim(nearest, 'wave', true); setAnim(ch, 'wave', true);
    nearest.think = ch.think = 8;                  // ~1.3s at LCD_TICK
    ch.emote = { icon: pick(['heart', 'note']), t: 8 };
    sfx.greet();
  }

  // ---- shared looping-behaviour runner -----------------------------------
  function startAct(ch, key) {
    const b = BEHAVIORS[key];
    ch.state = 'acting';
    ch.oneShot = null;
    ch.act = { key, phase: 'play', loops: b.loops ? irand(b.loops[0], b.loops[1] + 1) : 1, holdT: 0, holdDur: 0 };
    setAnim(ch, b.anim, true);
    ch.emote = b.emote ? { icon: b.emote, t: 6 } : null;     // ticks
  }
  function onActLoop(ch) {                          // called whenever the clip wraps
    const a = ch.act, b = BEHAVIORS[a.key];
    if (a.phase === 'play') {
      if (--a.loops > 0) return;                    // keep repeating the clip
      if (b.hold) { a.phase = 'hold'; a.holdT = 0; a.holdDur = irand(Math.round(b.holdDur[0] / LCD_TICK), Math.round(b.holdDur[1] / LCD_TICK) + 1); setAnim(ch, b.hold); }
      else finishAct(ch);
    } else if (a.phase === 'stand') {               // outro finished
      finishAct(ch);
    }
  }
  function finishAct(ch) {
    ch.act = null; ch.oneShot = null;
    ch.state = 'idle'; setAnim(ch, 'idle');
    ch.think = irand(3, 10);                        // ticks
  }

  const BODY_TO_ANIM = { jump: 'idle', dance: 'wave', kick: 'walk' };
  function bodyToAnim(b) { return BODY_TO_ANIM[b] || (CW_ANIM[b] ? b : 'idle'); }
  function startTrick(ch, cube) {
    const t = TRICKS[ch.trick];
    if (!t) return;
    ch.act = null;
    ch.state = 'trick'; ch.trickT = 0; ch.trickDur = TRICK_TICKS;
    setAnim(ch, bodyToAnim(t.body), true);
    ch.emote = null;
    cube.toast = { text: t.game, t: 3200, dur: 3200 };   // toast is UI chrome, ms (see C2)
    wakeCube(cube);
    sfx.greet();
  }

  // =============================================================== MINI-GAME
  // P1.1: interactive game engine. Deck button 0 starts/quits a game on that
  // cube; buttons 1/2 are game inputs while one runs. Presses latch between
  // ticks and are judged on the next LCD tick, so gameplay is as chunky as
  // the screen — like the real toy. The P1.1 primitive is a timing game: an
  // object closes in, press while it's in the strike window.
  const GAME_COUNTDOWN = 15;      // ticks of 3-2-1 (~2.4s)
  const GAME_OVER_HOLD = 20;      // ticks the final score stays up
  const GAME_MISSES = 3;
  const GAME_WINDOW = 2;          // |obj.x - ch.x| <= this counts as a hit
  const bestScores = new Map();   // roster index -> best score (P1.4 persists)

  function gamePlayer(cube) {
    if (!cube.game) return null;
    const ch = chars.find(c => c.id === cube.game.charId);
    return (ch && ch.cubeId === cube.id) ? ch : null;
  }
  function startGame(cube) {
    if (cube.game || cube.asleep || cube.boot) return;
    const occ = occupantsOf(cube).filter(c =>
      c.state !== 'transfer' && c.state !== 'entering' && c.state !== 'gaming');
    if (!occ.length) return;
    const ch = occ.find(c => c.homeId === cube.id) || occ[0];   // the resident hosts
    ch.act = null; ch.oneShot = null; ch.emote = null;
    ch.state = 'gaming';
    setAnim(ch, 'idle');
    const rosterIdx = ROSTER.indexOf(ch.ident);
    cube.game = {
      charId: ch.id, phase: 'countdown', t: 0,
      kind: GAME_KIND[ch.trick] || 'volley',
      score: 0, misses: 0, speed: 1, pressed: 0, bob: 0,
      best: bestScores.get(rosterIdx) || 0, rosterIdx,
      obj: null,
    };
    wakeCube(cube);
    sfx.count();
  }
  function endGame(cube, showScore) {
    const g = cube.game;
    if (!g) return;
    cube.game = null;
    const ch = chars.find(c => c.id === g.charId);
    if (ch && ch.state === 'gaming') { ch.state = 'idle'; setAnim(ch, 'idle'); ch.think = irand(4, 10); }
    if (showScore) {
      const name = (TRICKS[cube.housing.trick] || {}).game || 'GAME';
      cube.toast = { text: `${name} · ${g.score} PTS · BEST ${g.best}`, t: 3600, dur: 3600 };
    }
  }
  // one strike landed; true = the pace should ramp (every 3rd point)
  function gameHit(g, ch, anim) {
    g.score = Math.min(99, g.score + 1);
    if (g.score > g.best) { g.best = g.score; bestScores.set(g.rosterIdx, g.best); }
    if (anim) setAnim(ch, anim, true);
    sfx.hit();
    return g.score % 3 === 0;
  }
  // one strike missed; true = that was the third, game over
  function gameMiss(cube, g, ch) {
    g.misses++;
    setAnim(ch, 'dizzy', true);                       // stumble
    sfx.miss();
    if (g.misses >= GAME_MISSES) { g.phase = 'over'; g.t = 0; sfx.over(); return true; }
    return false;
  }

  // ---- game mechanics (P1.2): each is {init, tick, draw} ------------------
  // P1.1's generic volley stays the default; real characters map onto their
  // documented games via GAME_KIND. All motion/judgment is per-tick.
  const GAME_KIND = { whip: 'rope', slugger: 'bat', dodger: 'header' };
  const HEAD_Y = FLOOR_Y - 20;                        // header strike row
  const MECHANICS = {
    // a ball closes in from either side — strike it in the window
    volley: {
      init(g) { const L = Math.random() < 0.5; g.obj = { x: L ? 1 : LCD - 2, dir: L ? 1 : -1, wait: 0 }; },
      tick(cube, g, ch, pressed) {
        const o = g.obj;
        if (pressed) {
          if (o.wait === 0 && Math.abs(o.x - ch.x) <= GAME_WINDOW) {
            if (gameHit(g, ch, 'mad')) g.speed = Math.min(3, g.speed + 1);
            o.wait = irand(5, 9);
          } else if (gameMiss(cube, g, ch)) return;
        }
        if (o.wait > 0) { if (--o.wait === 0) MECHANICS.volley.init(g); return; }
        o.x += o.dir * g.speed;
        ch.facing = o.x >= ch.x ? 1 : -1;
        if ((o.dir > 0 && o.x > ch.x + GAME_WINDOW) || (o.dir < 0 && o.x < ch.x - GAME_WINDOW)) {
          const over = gameMiss(cube, g, ch);
          o.wait = irand(4, 8);
          if (over) return;
        }
      },
      draw(plane, g) {
        const o = g.obj;
        if (o.wait) return;
        setOn(plane, o.x, FLOOR_Y - 2); setOn(plane, o.x + 1, FLOOR_Y - 2);
        setOn(plane, o.x, FLOOR_Y - 1); setOn(plane, o.x + 1, FLOOR_Y - 1);
      },
    },
    // Whip's skipping rope: one sweep per cycle, hop as it reaches your feet
    rope: {
      init(g) { g.obj = { L: 14, p: 0 }; },
      tick(cube, g, ch, pressed) {
        const o = g.obj;
        o.p++;
        const atFeet = o.p >= o.L;
        if (pressed) {
          if (o.p >= o.L - 1) {                       // timed hop
            if (gameHit(g, ch, null)) o.L = Math.max(7, o.L - 2);
            g.bob = 3; o.p = 0;
          } else if (gameMiss(cube, g, ch)) return;   // jumped too early, tangled
        } else if (atFeet) {
          if (gameMiss(cube, g, ch)) return;          // rope caught your ankles
          o.p = 0;
        }
      },
      draw(plane, g, ch) {
        const o = g.obj;
        const h = Math.sin(Math.PI * o.p / o.L) * 19;  // 0 at feet, 19 overhead
        for (let i = -7; i <= 7; i++) {
          const t = i / 7, a = Math.sqrt(Math.max(0, 1 - t * t));
          if (h < 3) setOn(plane, ch.x + i, FLOOR_Y + 1 - a * 2);       // skimming the floor
          else setOn(plane, ch.x + i, FLOOR_Y - h * a);
        }
        setOn(plane, ch.x - 6, FLOOR_Y - 10); setOn(plane, ch.x + 6, FLOOR_Y - 10);  // handles
      },
    },
    // Slugger's batting: a pitch flies in, swing to send it flying
    bat: {
      init(g) { const L = Math.random() < 0.5; g.obj = { x: L ? 1 : LCD - 2, dir: L ? 1 : -1, wait: 0, fly: 0, fx: 0, fy: 0, swing: 0 }; },
      tick(cube, g, ch, pressed) {
        const o = g.obj;
        if (o.swing > 0) o.swing--;
        if (o.fly > 0) { o.fly--; o.fx += o.fdir * 3; o.fy -= 2; }
        if (pressed) {
          o.swing = 2;
          if (o.wait === 0 && Math.abs(o.x - ch.x) <= GAME_WINDOW) {   // CRACK
            if (gameHit(g, ch, 'mad')) g.speed = Math.min(3, g.speed + 1);
            o.fly = 5; o.fx = o.x; o.fy = FLOOR_Y - 8; o.fdir = -o.dir;
            o.wait = irand(6, 10);
          } else if (gameMiss(cube, g, ch)) return;   // swung at air
        }
        if (o.wait > 0) { if (--o.wait === 0) { const L = Math.random() < 0.5; o.x = L ? 1 : LCD - 2; o.dir = L ? 1 : -1; } return; }
        o.x += o.dir * g.speed;
        ch.facing = o.x >= ch.x ? 1 : -1;
        if ((o.dir > 0 && o.x > ch.x + GAME_WINDOW) || (o.dir < 0 && o.x < ch.x - GAME_WINDOW)) {
          const over = gameMiss(cube, g, ch);         // strike!
          o.wait = irand(5, 9);
          if (over) return;
        }
      },
      draw(plane, g, ch) {
        const o = g.obj;
        if (o.wait === 0) { setOn(plane, o.x, FLOOR_Y - 7); setOn(plane, o.x + 1, FLOOR_Y - 7); setOn(plane, o.x, FLOOR_Y - 8); }  // the pitch
        if (o.fly > 0) { setOn(plane, o.fx, o.fy); setOn(plane, o.fx + 1, o.fy - 1); }   // it's outta here
        const bx = ch.x + ch.facing * 3, by = FLOOR_Y - 11;
        if (o.swing > 0) for (let r = 0; r < 6; r++) setOn(plane, bx + ch.facing * r, by + 2 + (r >> 1));  // swung level
        else for (let r = 0; r < 6; r++) setOn(plane, bx + ch.facing * (r >> 1), by - r + 2);              // bat held up
      },
    },
    // Dodger's headers: the ball drops — nod it back up at head height
    header: {
      init(g, ch) { g.obj = { x: clamp(ch.x + irand(-1, 2), 3, LCD - 3), y: 2, wait: 0 }; },
      tick(cube, g, ch, pressed) {
        const o = g.obj;
        if (pressed) {
          if (o.wait === 0 && o.y >= HEAD_Y - 2 && o.y <= HEAD_Y + 1) {   // nodded it up
            gameHit(g, ch, null);
            g.bob = 2;
            o.wait = irand(5, 9);
          } else if (gameMiss(cube, g, ch)) return;
        }
        if (o.wait > 0) { if (--o.wait === 0) MECHANICS.header.init(g, ch); return; }
        o.y += Math.min(3, 1 + Math.floor(g.score / 3));   // falls faster as you score
        if (o.y >= FLOOR_Y - 1) {
          const over = gameMiss(cube, g, ch);         // it hit the deck
          o.wait = irand(5, 9);
          if (over) return;
        }
      },
      draw(plane, g) {
        const o = g.obj;
        if (o.wait) return;
        setOn(plane, o.x, o.y); setOn(plane, o.x + 1, o.y);
        setOn(plane, o.x, o.y + 1); setOn(plane, o.x + 1, o.y + 1);
      },
    },
  };

  function tickGame(cube) {
    const g = cube.game;
    if (!g) return;
    const ch = gamePlayer(cube);
    if (!ch || ch.state !== 'gaming') { endGame(cube, false); return; }   // player got yanked
    g.t++;
    const pressed = g.pressed; g.pressed = 0;         // consume the latch
    if (g.phase === 'countdown') {
      // use the 3-2-1 to walk the player to centre stage
      if (ch.x !== CENTER_X) {
        ch.facing = ch.x <= CENTER_X ? 1 : -1;
        ch.x = towardTick(ch.x, CENTER_X, WALK_DOTS);
        setAnim(ch, 'walk');
      } else if (ch.anim === 'walk') setAnim(ch, 'idle');
      if (g.t % 5 === 0 && g.t < GAME_COUNTDOWN) sfx.count();
      if (g.t >= GAME_COUNTDOWN) { g.phase = 'play'; g.t = 0; MECHANICS[g.kind].init(g, ch); }
      return;
    }
    if (g.phase === 'play') {
      if (!ch.oneShot && ch.anim !== 'idle') setAnim(ch, 'idle');   // pose finished
      if (g.bob > 0) g.bob--;
      MECHANICS[g.kind].tick(cube, g, ch, pressed);
      return;
    }
    if (g.t >= GAME_OVER_HOLD) endGame(cube, true);   // 'over': hold, then bow out
  }

  // co-occupants sharing a cube occasionally turn to greet each other (they're
  // already spaced apart, so no overlap — they wave across the gap). This runs
  // once per cube per LCD tick at a low probability per pair (spec A2).
  const INTERACT_CHANCE = 0.02;
  function tickInteractions(cube) {
    if (cube.asleep) return;
    const list = occupantsOf(cube).filter(c => c.state === 'idle');
    if (list.length < 2) return;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.random() < INTERACT_CHANCE) {
          a.facing = b.x >= a.x ? 1 : -1; b.facing = a.x >= b.x ? 1 : -1;
          a.state = b.state = 'interacting';
          setAnim(a, 'wave', true); setAnim(b, 'wave', true);
          a.think = b.think = 8;                    // ticks (~1.3s)
          const icon = pick(['heart', 'note', 'exclaim']);
          a.emote = { icon, t: 8 };
          sfx.greet();
        }
      }
  }

  // advance one cube — and every character currently inside it — by exactly
  // one LCD tick. All screen-visible state (frames, positions, doors, blind,
  // boot, trick progress, timers) changes only here.
  function tickCube(cube) {
    layoutCube(cube);                                // keep lanes fresh before movement
    if (cube.boot) {
      cube.boot.t++;
      if (cube.boot.t >= cube.boot.dur) cube.boot = null;
    }
    if (cube.asleep) {
      // occupants still need their frame reset to idle, but nothing else advances
      for (const ch of occupantsOf(cube)) setAnim(ch, 'idle');
    } else {
      for (const ch of occupantsOf(cube)) {
        tickChar(ch, cube);
        if (ch.emote) { ch.emote.t--; if (ch.emote.t <= 0) ch.emote = null; }
      }
      tickGame(cube);
      tickInteractions(cube);
    }
    // doors / hatches open while a character is crossing that edge, else shut —
    // integer 0..DOOR_STEPS, one step per tick
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      const want = edgeActive(cube, edge) ? DOOR_STEPS : 0;
      if (cube.door[edge] < want) cube.door[edge]++;
      else if (cube.door[edge] > want) cube.door[edge]--;
    }
    // Venetian blind lowers over an emptied, still-connected cube — BLIND_STEP
    // rows per tick, integer 0..LCD
    const blindTarget = (cube.occupants.length === 0 && cubeConnected(cube)) ? LCD : 0;
    if (cube.blind < blindTarget) cube.blind = Math.min(LCD, cube.blind + BLIND_STEP);
    else if (cube.blind > blindTarget) cube.blind = Math.max(0, cube.blind - BLIND_STEP);
  }

  function updateChars(dt) {
    // per-cube LCD tick accumulator — each cube advances independently so
    // cubes don't visibly lockstep (A1). Screen content is bit-identical
    // between ticks; only the accumulator changes every rAF frame.
    for (const cube of cubes) {
      cube.tickT += dt;
      while (cube.tickT >= LCD_TICK) {
        cube.tickT -= LCD_TICK;
        cube.ticks++;
        tickCube(cube);
      }
    }
  }

  function updateCubes(dt) {
    // physical-world / UI-chrome timers only — smooth at 60fps (housing shake,
    // magnetic-latch pulse, toast slide/fade, sleep countdown).
    for (const cube of cubes) {
      if (cube.wiggle > 0) cube.wiggle = Math.max(0, cube.wiggle - dt);
      if (cube.connFlash > 0) cube.connFlash = Math.max(0, cube.connFlash - dt);
      if (cube._pressT > 0) cube._pressT = Math.max(0, cube._pressT - dt);
      // sleep timer — dozing off powers the game down too
      cube.idle += dt;
      if (!cube.asleep && cube.idle > SLEEP_IDLE) { cube.asleep = true; if (cube.game) endGame(cube, false); }
      // game-name caption chip (C2 — floating UI chrome, smooth)
      if (cube.toast) { cube.toast.t -= dt; if (cube.toast.t <= 0) cube.toast = null; }
    }
  }

  function pokeCube(cube) {
    wakeCube(cube);
    cube.wiggle = 320;
    // a figure mid-doorway (transfer OR entering) can be off the 32-dot panel;
    // hijacking it into a poke reaction would strand it off-screen. A gaming
    // figure belongs to its game.
    const occ = occupantsOf(cube).filter(c => c.state !== 'transfer' && c.state !== 'entering' && c.state !== 'gaming');
    if (occ.length) {
      const ch = pick(occ);
      // a poke often coaxes out the character's signature trick
      if (Math.random() < 0.5 && TRICKS[ch.trick]) { startTrick(ch, cube); }
      else {
        ch.act = null; ch.state = 'acting'; setAnim(ch, pick(['mad', 'wave', 'bend']), true);
        ch.emote = { icon: 'exclaim', t: 4 };
        ch.think = 4;
      }
    }
    sfx.poke();
  }

  function shakeAll() {
    ensureAudio();
    for (const cube of cubes) { cube.wiggle = 500; wakeCube(cube); if (cube.game) endGame(cube, false); }
    for (const ch of chars) {
      ch.act = null; ch.yOff = 0; ch.dizzy = irand(9, 14); ch.state = 'dizzy'; setAnim(ch, 'dizzy'); ch.emote = null;
      // a shake can interrupt a figure mid-portal (x past the panel edge) —
      // it tumbles back inside rather than staying stranded off-screen.
      ch.x = clamp(ch.x, 5, 27); ch.transPhase = null;
    }
    sfx.dizzy();
  }

  // ================================================================ RENDER
  function buildMatrixTile() {
    // one dot cell: pale panel with a subtly lighter centre → dot-matrix grid
    const t = document.createElement('canvas');
    t.width = DOT; t.height = DOT;
    const c = t.getContext('2d');
    c.fillStyle = LCD_OFF; c.fillRect(0, 0, DOT, DOT);
    c.fillStyle = LCD_OFF_HI; c.fillRect(0, 0, DOT - 1, DOT - 1);
    c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(DOT - 1, 0, 1, DOT); c.fillRect(0, DOT - 1, DOT, 1);
    matrixTile = ctx.createPattern(t, 'repeat');
  }

  function blitFrame(plane, frameIndex, cx, baseY, facing) {
    const f = CW_FRAMES[frameIndex];
    if (!f) return;
    const left = Math.round(cx - f.w / 2);
    const top = baseY - f.h + 1;
    for (let j = 0; j < f.h; j++) {
      const row = f.rows[j];
      for (let i = 0; i < f.w; i++) {
        if (row.charCodeAt(i) === 49) { // '1'
          const px = facing < 0 ? left + (f.w - 1 - i) : left + i;
          const py = top + j;
          if (px >= 0 && px < LCD && py >= 0 && py < LCD) plane[py * LCD + px] = 1;
        }
      }
    }
  }

  function blitIcon(plane, icon, cx, topY) {
    const bmp = EMOTES[icon]; if (!bmp) return;
    const w = bmp[0].length, left = Math.round(cx - w / 2);
    // C5: shift the whole icon down instead of clipping rows above the top
    // edge — a poke near the top of the screen used to lose the emote
    // entirely; now it's always fully visible, just closer to the figure.
    if (topY < 0) topY = 0;
    for (let j = 0; j < bmp.length; j++)
      for (let i = 0; i < w; i++)
        if (bmp[j].charCodeAt(i) === 49) {
          const px = left + i, py = topY + j;
          if (px >= 0 && px < LCD && py >= 0 && py < LCD) plane[py * LCD + px] = 1;
        }
  }

  // ---- signature-trick props (procedural LCD pixel art) ------------------
  function setOn(plane, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < LCD && y >= 0 && y < LCD) plane[y * LCD + x] = 1;
  }
  function stamp(plane, bmp, x, y) {
    for (let j = 0; j < bmp.length; j++)
      for (let i = 0; i < bmp[j].length; i++)
        if (bmp[j].charCodeAt(i) === 49) setOn(plane, x + i, y + j);
  }
  function disc(plane, cx, cy, r) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r + 1) setOn(plane, cx + x, cy + y);
  }

  // each drawer: (plane, ch, ph) where ph is trick progress 0..1
  const PROP = {
    dog(p, ch, ph) { const bob = Math.round(Math.abs(Math.sin(ph * 7 * Math.PI)) * 2);
      stamp(p, PROP_BMP.dog, Math.round(ch.x + ch.facing * 8 - 3), FLOOR_Y - 3 - bob); },
    alien(p, ch, ph) { const ax = ch.x - 11 + ph * 22;
      stamp(p, PROP_BMP.alien, Math.round(ax - 2), FLOOR_Y - 4);
      const sx = Math.round(ch.x + ch.facing * 5); for (let y = 0; y < 6; y++) setOn(p, sx, FLOOR_Y - 13 + y); },
    header(p, ch, ph) { const by = FLOOR_Y - 23 - Math.round(Math.abs(Math.sin(ph * 5 * Math.PI)) * 4); disc(p, Math.round(ch.x), by, 1); },
    rope(p, ch, ph) { const s = Math.sin(ph * 6 * Math.PI), hy = FLOOR_Y - 10;
      for (let i = -7; i <= 7; i++) { const t = i / 7, a = Math.sqrt(Math.max(0, 1 - t * t));
        setOn(p, ch.x + i, s > 0 ? hy - a * 11 : FLOOR_Y + 1 - a * 2); }
      setOn(p, ch.x - 6, hy); setOn(p, ch.x + 6, hy); },
    notes(p, ch, ph) { for (let k = 0; k < 3; k++) { const kp = (ph * 2 + k / 3) % 1;
      stamp(p, EMOTES.note, Math.round(ch.x + ch.facing * 6 + (k - 1) * 2 - 2), Math.round(FLOOR_Y - 16 - kp * 10)); } },
    block(p, ch, ph) { const bx = Math.round(ch.x + ch.facing * 7);
      if (ph < 0.55) stamp(p, ['111', '111', '111'], bx, FLOOR_Y - 6);
      else { const g = Math.round((ph - 0.55) * 10); stamp(p, ['11', '11', '11'], bx - g, FLOOR_Y - 6); stamp(p, ['11', '11', '11'], bx + 2 + g, FLOOR_Y - 6); } },
    mole(p, ch, ph) { const bx = Math.round(ch.x + ch.facing * 7), swing = Math.sin(ph * 4 * Math.PI);
      if (swing > 0) stamp(p, PROP_BMP.mole, bx, FLOOR_Y - 4);
      const hy = FLOOR_Y - 14 + (swing < 0 ? 6 : 0); setOn(p, bx + 1, hy - 1); stamp(p, ['111'], bx, hy); },
    fly(p, ch, ph) { const fx = ch.x + ch.facing * 6 + Math.cos(ph * 12 * Math.PI) * 4,
      fy = FLOOR_Y - 14 + Math.sin(ph * 10 * Math.PI) * 5; setOn(p, fx, fy); setOn(p, fx + 1, fy); },
    door(p, ch, ph) { stamp(p, PROP_BMP.door, Math.round(ch.x + ch.facing * 7 + ph * 3), FLOOR_Y - 8); },
    fire(p, ch, ph) { const fx = Math.round(ch.x + ch.facing * 9), sz = Math.max(0, 3 - Math.round(ph * 3));
      for (let k = 0; k <= sz; k++) { setOn(p, fx, FLOOR_Y - 1 - k); if (k < sz) { setOn(p, fx - 1, FLOOR_Y - 1 - k); setOn(p, fx + 1, FLOOR_Y - 1 - k); } }
      for (let t = 0; t <= 6; t++) if (((t + Math.floor(ph * 16)) % 2) === 0) setOn(p, ch.x + ch.facing * (3 + t), FLOOR_Y - 12 + t * t * 0.28); },
    paper(p, ch, ph) { for (let k = 0; k < 3; k++) { const kp = (ph * 1.5 + k / 3) % 1;
      stamp(p, PROP_BMP.paper, Math.round(ch.x + ch.facing * 7 + (k - 1) * 3 - 2), Math.round(FLOOR_Y - 18 + kp * 16)); } },
    dogbite(p, ch, ph) { const bob = Math.round(Math.abs(Math.sin(ph * 8 * Math.PI)) * 2);
      stamp(p, PROP_BMP.dog, Math.round(ch.x - ch.facing * 7 - 3), FLOOR_Y - 3 - bob); },
    bat(p, ch, ph) { const hx = ch.x + ch.facing * 4, hy = FLOOR_Y - 12, ang = -1.2 + ph * 2.2;
      for (let r = 0; r < 7; r++) setOn(p, hx + ch.facing * Math.cos(ang) * r, hy + Math.sin(ang) * r);
      if (ph > 0.7) disc(p, ch.x + ch.facing * (6 + (ph - 0.7) * 30), FLOOR_Y - 16, 1); },
    ball(p, ch, ph) { disc(p, ch.x + ch.facing * (4 + ph * 22), FLOOR_Y - 2 - Math.sin(ph * Math.PI) * 14, 1); },
    hoop(p, ch, ph) { const nx = Math.round(ch.x + ch.facing * 9); stamp(p, PROP_BMP.hoopNet, nx - 3, FLOOR_Y - 22);
      const bx = ch.x + (ch.facing * 9) * ph, by = (FLOOR_Y - 14) + (-6) * ph - Math.sin(ph * Math.PI) * 4; disc(p, bx, by, 1); },
    board(p, ch, ph) { const bx = Math.round(ch.x + Math.sin(ph * 2 * Math.PI) * 3); stamp(p, PROP_BMP.board, bx - 3, FLOOR_Y - 1); },
    water(p, ch, ph) { for (let x = 2; x < 30; x++) setOn(p, x, FLOOR_Y - 1 + Math.sin(x * 0.6 + ph * 8));
      for (let k = 0; k < 3; k++) { const kp = (ph * 2 + k / 3) % 1; setOn(p, ch.x + ch.facing * 5 + k * 2, FLOOR_Y - 2 - kp * 10); } },
    rocket(p, ch, ph) { const rx = ch.x + ch.facing * 4 + ph * 10, ry = FLOOR_Y - 8 - ph * 20;
      stamp(p, ['010', '111', '111', '101'], Math.round(rx - 1), Math.round(ry));
      for (let k = 1; k <= 3; k++) setOn(p, rx, ry + 4 + k);
      setOn(p, 5, 6); setOn(p, 26, 4); setOn(p, 20, 9); setOn(p, 9, 3); },
    snake(p, ch, ph) { const bx = Math.round(ch.x + ch.facing * 7), h = Math.round(4 + ph * 10);
      for (let y = 0; y < h; y++) setOn(p, bx + Math.sin(y * 0.6 + ph * 10) * 1.5, FLOOR_Y - 2 - y);
      stamp(p, ['111', '101', '111'], bx - 1, FLOOR_Y - 2); },
    globe(p, ch, ph) { const gx = Math.round(ch.x + ch.facing * 7); stamp(p, PROP_BMP.globe, gx - 2, FLOOR_Y - 18);
      const a = ph * 2 * Math.PI; setOn(p, gx + Math.cos(a) * 5, FLOOR_Y - 16 + Math.sin(a) * 5); },
    taxi(p, ch, ph) { stamp(p, PROP_BMP.taxi, Math.round(-6 + ph * 40), FLOOR_Y - 4); },
  };

  // ---- LCD score digits (3x5 font from data.js, scalable) -----------------
  function drawDigit(plane, d, x, y, s) {
    const bmp = LCD_DIGITS[d]; if (!bmp) return;
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 3; i++)
        if (bmp[j].charCodeAt(i) === 49)
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
            setOn(plane, x + i * s + dx, y + j * s + dy);
  }
  const numWidth = (n, s) => String(Math.max(0, n | 0)).length * 4 * s - s;
  function drawNum(plane, n, x, y, s) {
    for (const c of String(Math.max(0, n | 0))) { drawDigit(plane, +c, x, y, s); x += 4 * s; }
  }

  // ---- mini-game screen furniture (drawn over the live scene) -------------
  function drawGameHud(plane, cube) {
    const g = cube.game;
    const ch = gamePlayer(cube);
    if (!g || !ch) return;
    if (g.phase === 'countdown') {                    // big 3-2-1 up top
      const d = clamp(3 - Math.floor(g.t / 5), 1, 3);
      drawDigit(plane, d, CENTER_X - 3, 2, 2);
      return;
    }
    if (g.phase === 'play') {
      if (g.obj) MECHANICS[g.kind].draw(plane, g, ch);
      drawNum(plane, g.score, LCD - 1 - numWidth(g.score, 1), 1, 1);
      for (let m = 0; m < g.misses; m++) {            // miss pips, top-left
        setOn(plane, 1 + m * 3, 1); setOn(plane, 2 + m * 3, 2);
        setOn(plane, 2 + m * 3, 1); setOn(plane, 1 + m * 3, 2);
      }
      return;
    }
    if ((g.t & 3) !== 3)                              // 'over': final score flashes big
      drawNum(plane, g.score, CENTER_X - (numWidth(g.score, 2) >> 1), 2, 2);
  }

  function drawTrick(plane, ch) {
    const t = TRICKS[ch.trick];
    const ph = clamp(ch.trickDur ? ch.trickT / ch.trickDur : 0, 0, 1);
    if (!t) { blitFrame(plane, CW_ANIM.idle[0], ch.x, FLOOR_Y, ch.facing); return; }
    const seq = CW_ANIM[bodyToAnim(t.body)] || CW_ANIM.idle;
    const fi = seq[ch.trickT % seq.length];          // ch.trickT is a tick count now
    let bob = 0;
    if (t.body === 'jump') bob = -Math.round(Math.abs(Math.sin(ph * (t.prop === 'rope' ? 6 : 3) * Math.PI)) * 4);
    blitFrame(plane, fi, ch.x, FLOOR_Y + bob, ch.facing);
    const draw = PROP[t.prop];
    if (draw) draw(plane, ch, ph);
  }

  // ---- power-on boot: a maze wipe-on, then the figure reveals -------------
  function mazeBit(x, y) {
    if ((x & 3) && (y & 3)) return 0;                 // only draw on a 4px grid
    const h = (((x * 7 + 3) * (y * 13 + 5)) >>> 0);
    return (h % 5 !== 0) ? 1 : 0;                      // most segments on, some gaps
  }
  function drawBoot(plane, cube) {
    // B3: wake-from-sleep power-flash — a short flash-only variant of boot
    // (no maze, just an all-ON flash for the first couple ticks then live).
    if (cube.boot.flash) {
      if (cube.boot.t < BOOT_FLASH_TICKS - 1) { plane.fill(1); return; }
      composeLive(plane, cube);
      return;
    }
    const ph = clamp(cube.boot.t / cube.boot.dur, 0, 1);
    if (ph < 0.12) { plane.fill(1); return; }          // all-segments power-on flash
    if (ph < 0.48) {                                    // maze builds top → bottom
      const row = ((ph - 0.12) / 0.36) * LCD;
      for (let y = 0; y < row && y < LCD; y++)
        for (let x = 0; x < LCD; x++) if (mazeBit(x, y)) plane[y * LCD + x] = 1;
      return;
    }
    if (ph < 0.82) {                                    // maze clears top → bottom
      const row = ((ph - 0.48) / 0.34) * LCD;
      for (let y = Math.floor(row); y < LCD; y++)
        for (let x = 0; x < LCD; x++) if (mazeBit(x, y)) plane[y * LCD + x] = 1;
      return;
    }
    composeLive(plane, cube);                           // figure settles in
  }

  // ---- doorway (side door) / hatch (ceiling & floor) art -----------------
  // `open` = 0 shut .. 1 fully open. Side doors slide a panel into the wall;
  // hatches part two leaves away from the centre.
  function drawPortal(plane, edge, open) {
    open = clamp(open, 0, 1);
    if (edge === 'left' || edge === 'right') {
      const H = 22, bot = FLOOR_Y, top = FLOOR_Y - H;   // tall enough to clear a standing figure
      const right = edge === 'right';
      const z0 = right ? LCD - 5 : 0, z1 = z0 + 4;   // 5-wide door zone
      const jamb = right ? z0 : z1;                  // inner post column
      for (let x = z0; x <= z1; x++) { setOn(plane, x, top); setOn(plane, x, bot); }  // lintel + threshold
      for (let y = top; y <= top + 3; y++) setOn(plane, jamb, y);                     // short jamb ticks
      for (let y = bot - 3; y <= bot; y++) setOn(plane, jamb, y);
      const iLo = right ? z0 + 1 : z0, iHi = right ? z1 : z1 - 1;   // sliding-panel interior cols
      const covered = Math.round((iHi - iLo + 1) * (1 - open));
      const seam = top + (H >> 1);
      for (let k = 0; k < covered; k++) {
        const x = right ? (iHi - k) : (iLo + k);     // retract toward the outer wall
        for (let y = top + 1; y < bot; y++) if (y !== seam) setOn(plane, x, y);
      }
    } else {
      const bottomEdge = edge === 'bottom';
      const row = bottomEdge ? FLOOR_Y : 1;
      const lip = bottomEdge ? row - 1 : row + 1;
      const half = 6, jL = CENTER_X - half - 1, jR = CENTER_X + half + 1;
      setOn(plane, jL, row); setOn(plane, jR, row);  // jamb caps
      setOn(plane, jL, lip); setOn(plane, jR, lip);
      const L = Math.round((half + 1) * (1 - open));  // each leaf's reach from its jamb
      for (let k = 0; k < L; k++) {
        setOn(plane, jL + 1 + k, row); setOn(plane, jR - 1 - k, row);
        if (k < L - 1) { setOn(plane, jL + 1 + k, lip); setOn(plane, jR - 1 - k, lip); }
      }
    }
  }

  // draw scene background + occupant figures/props
  function composeLive(plane, cube) {
    if (cube.scene) drawScene(plane, cube.scene, cube.ticks);
    // doors / hatches sit behind the figures so a character passes in front
    for (const edge of ['left', 'right', 'top', 'bottom'])
      if (cube.door[edge] > 0) drawPortal(plane, edge, cube.door[edge] / DOOR_STEPS);
    for (const ch of occupantsOf(cube)) {
      if (ch.state === 'trick') { drawTrick(plane, ch); continue; }
      // B4: while clambering through a hatch, alternate the arms-up traced
      // pose (frame 21) with the current walk frame instead of the plain seq.
      const climbing = ((ch.state === 'entering' && ch.transAxis === 'v' && ch.yOff !== 0) ||
        (ch.state === 'transfer' && ch.transAxis === 'v' && ch.transPhase === 'cross'));
      const seq = CW_ANIM[ch.anim] || CW_ANIM.idle;
      const frameIndex = climbing && ch.clamber ? 21 : seq[clamp(ch.frame, 0, seq.length - 1)];
      let baseY = FLOOR_Y + (ch.yOff || 0);
      if (cube.game && cube.game.charId === ch.id && cube.game.bob) baseY -= 3;   // mid-hop
      blitFrame(plane, frameIndex, ch.x, baseY, ch.facing);
      if (ch.emote) blitIcon(plane, ch.emote.icon, ch.x, baseY - 24);
    }
    if (cube.game) drawGameHud(plane, cube);
  }

  // compose a cube's 32x32 LCD plane
  function composePlane(cube) {
    const plane = cube.plane;
    plane.fill(0);
    if (cube.boot) { drawBoot(plane, cube); return plane; }
    if (cube.asleep) return plane;        // asleep = blank pale screen (segments off)
    composeLive(plane, cube);
    // A4: Venetian blind is drawn as LCD pixels, not a canvas overlay — striped
    // black shutter (every 4th row left as a pale slat gap) lowering per tick.
    if (cube.blind > 0) {
      for (let y = 0; y < cube.blind; y++) {
        if ((y & 3) === 3) continue;               // slat gap every 4th row
        for (let x = 0; x < LCD; x++) plane[y * LCD + x] = 1;
      }
    }
    return plane;
  }

  // ---- jumbo-cube scene backgrounds (original art capturing the video scenes) --
  // `ticks` is the owning cube's LCD tick counter — scene motion steps once
  // per tick (A2), never smoothly between ticks.
  function drawScene(plane, kind, ticks) {
    const on = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < LCD && y >= 0 && y < LCD) plane[y * LCD + x] = 1; };
    if (kind === 'beach') {
      // palm trunk, curving up the left with ring texture
      for (let y = 10; y <= FLOOR_Y; y++) { const tx = 4 + Math.round(Math.sin((FLOOR_Y - y) * 0.22) * 2); on(tx, y); if ((y & 1) === 0) on(tx + 1, y); }
      const hx = 4 + Math.round(Math.sin((FLOOR_Y - 10) * 0.22) * 2), hy = 9;   // frond hub
      // five drooping fronds
      const fronds = [[-1, -0.4], [-0.5, -0.9], [0.2, -1], [0.9, -0.7], [1.3, -0.2]];
      for (const [dx, dy] of fronds) for (let r = 1; r <= 8; r++)
        on(hx + dx * r + (dx > 0 ? r * r * 0.03 : -r * r * 0.03), hy + dy * r + r * r * 0.05);
      // two coconuts under the fronds
      on(hx + 1, hy + 2); on(hx + 2, hy + 2); on(hx + 4, hy + 3); on(hx + 5, hy + 3);
      // sky: slow day/night cycle — crescent moon by night, rayed sun by day
      const night = ((ticks / 94) % 1) < 0.5;       // ~15000ms / LCD_TICK cycle
      if (night) {
        for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
          const d = xx * xx + yy * yy, d2 = (xx + 2) * (xx + 2) + yy * yy;
          if (d <= 10 && d2 > 10) on(26 + xx, 7 + yy);
        }
      } else {
        for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy <= 4) on(26 + xx, 7 + yy);
        for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, 3], [3, -3], [-3, 3]]) on(26 + dx, 7 + dy);
      }
      // a bird drifting across the sky
      const brd = 8 + (ticks % 20);
      on(brd, 5); on(brd + 1, 4); on(brd + 2, 5); on(brd + 5, 6); on(brd + 6, 5); on(brd + 7, 6);
      // little beach hut on the right
      for (let x = 22; x <= 28; x++) on(x, FLOOR_Y - 3);                 // roof line
      on(21, FLOOR_Y - 2); on(29, FLOOR_Y - 2);
      for (let y = FLOOR_Y - 2; y <= FLOOR_Y; y++) { on(22, y); on(28, y); }
      // shoreline (rolling dashed surf)
      for (let x = 0; x < LCD; x++) if ((x + Math.floor(ticks / 2.5)) % 3 !== 0) on(x, FLOOR_Y + 1);
    } else if (kind === 'city') {
      // skyline of buildings with lit windows
      const b = [[0, 15], [6, 8], [11, 19], [16, 6], [22, 12], [27, 17]];
      const tw = Math.floor(ticks / 4);              // ~650ms / LCD_TICK cycle
      for (const [bx, top] of b) {
        for (let y = top; y <= FLOOR_Y; y++) { on(bx, y); on(bx + 4, y); }
        for (let x = bx; x <= bx + 4; x++) on(x, top);
        for (let y = top + 2; y < FLOOR_Y - 1; y += 3) {                 // windows twinkle
          if (((bx * 3 + y * 7 + tw) % 5) !== 0) on(bx + 1, y);
          if (((bx * 5 + y * 11 + tw) % 5) !== 0) on(bx + 3, y);
        }
      }
      // a ladder between two buildings
      const lx = 10;
      for (let y = 12; y <= FLOOR_Y; y++) { on(lx, y); on(lx + 2, y); if ((y & 1) === 0) on(lx + 1, y); }
      for (let x = 0; x < LCD; x++) on(x, FLOOR_Y + 1);                  // street
      // a little taxi cruising the street
      const car = -6 + (ticks % 44);
      for (let x = 0; x < 7; x++) on(car + x, FLOOR_Y);
      on(car + 1, FLOOR_Y - 1); on(car + 5, FLOOR_Y - 1);
    }
  }

  // A3: STN ghosting decay factor for this render frame — half-life ~90ms.
  // Real STN pixels don't snap off; they fade. lum stays 1 while a dot is ON
  // and decays exponentially once it switches OFF, giving moving figures a
  // subtle brief trail between LCD ticks.
  function decayFactor(dt) { return Math.pow(0.5, dt / GHOST_HALF_LIFE); }

  function drawScreen(cube, sx, sy, dt) {
    const S = SCREEN_PX;
    const w = cube.jumbo ? WELL + 5 : WELL;          // jumbo cubes: deeper frame
    // deep recessed near-black well around the LCD
    ctx.fillStyle = '#090b06';
    roundRect(ctx, sx - w, sy - w, S + w * 2, S + w * 2, 9); ctx.fill();
    if (cube.jumbo) { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; roundRect(ctx, sx - 3, sy - 3, S + 6, S + 6, 5); ctx.stroke(); }
    // inner shadow lip (top + left, for the sunken look)
    ctx.save();
    roundRect(ctx, sx - w, sy - w, S + w * 2, S + w * 2, 9); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(sx - w, sy - w, S + w * 2, 5);
    ctx.fillRect(sx - w, sy - w, 5, S + w * 2);
    ctx.restore();

    // pale LCD panel
    ctx.save();
    roundRect(ctx, sx, sy, S, S, 2); ctx.clip();
    ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = matrixTile; ctx.fillRect(0, 0, S, S); ctx.restore();

    // ON pixels, with STN ghosting (A3): the plane itself is bit-identical
    // between LCD ticks, but lum decays every render frame so a dot that just
    // switched off keeps a fading trace instead of vanishing instantly.
    const plane = composePlane(cube);
    const lum = cube.lum, decay = decayFactor(dt);
    for (let y = 0; y < LCD; y++)
      for (let x = 0; x < LCD; x++) {
        const idx = y * LCD + x;
        if (plane[idx]) lum[idx] = 1;
        else if (lum[idx] > 0) lum[idx] *= decay;
        const l = lum[idx];
        if (l < 0.04) continue;
        ctx.globalAlpha = Math.min(1, l);
        ctx.fillStyle = LCD_ON;
        ctx.fillRect(sx + x * DOT, sy + y * DOT, DOT - 1, DOT - 1);
      }
    ctx.globalAlpha = 1;

    // glass sheen
    ctx.fillStyle = LCD_GLASS;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx + S * 0.5, sy); ctx.lineTo(sx + S * 0.2, sy + S * 0.5); ctx.lineTo(sx, sy + S * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // one grey pressable button on the control deck. B5: while pressed, it
  // renders shifted 1px down with a darker gradient (no shadow, since it's
  // sunk in).
  function drawButton(x, y, w, h, pressed) {
    if (pressed) y += 1;
    else { roundRect(ctx, x, y + 2, w, h, 3); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); }   // shadow
    roundRect(ctx, x, y, w, h, 3);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (pressed) { g.addColorStop(0, '#b5b2a5'); g.addColorStop(1, '#8f8c81'); }
    else { g.addColorStop(0, '#e9e6da'); g.addColorStop(1, '#bcb9ac'); }
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
  }

  function drawCube(cube, dt) {
    const shake = cube.wiggle > 0 ? Math.sin(cube.wiggle * 0.09) * (cube.wiggle / 500) * 4 : 0;
    const x = Math.round(cube.x + shake), y = Math.round(cube.y);
    ctx.save();
    ctx.translate(x, y);

    // plastic housing
    const g = ctx.createLinearGradient(0, 0, 0, CUBE_SIZE);
    if (cube.housing.translucent) { g.addColorStop(0, lighten(cube.housing.base, 0.10)); g.addColorStop(1, cube.housing.dark); ctx.globalAlpha = 0.93; }
    else { g.addColorStop(0, lighten(cube.housing.base, 0.18)); g.addColorStop(0.6, cube.housing.base); g.addColorStop(1, lighten(cube.housing.base, -0.08)); }
    roundRect(ctx, 0, 0, CUBE_SIZE, CUBE_SIZE, 20);
    ctx.fillStyle = g; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ctx.strokeStyle = cube.housing.dark; ctx.stroke();

    // rounded top sheen
    ctx.save(); roundRect(ctx, 0, 0, CUBE_SIZE, CUBE_SIZE, 20); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.moveTo(10, 8); ctx.lineTo(CUBE_SIZE - 10, 8);
    ctx.quadraticCurveTo(CUBE_SIZE * 0.5, 34, 10, 30); ctx.closePath(); ctx.fill();
    if (cube.housing.translucent) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(4, CUBE_SIZE * 0.4, CUBE_SIZE - 8, CUBE_SIZE * 0.55); }
    ctx.restore();

    drawScreen(cube, SCREEN_X, SCREEN_Y, dt);

    // ---- control deck: molded game-icon (never swapped — see C2) + three buttons ----
    const deckTop = SCREEN_Y + SCREEN_PX + WELL + 1;
    drawGameIcon(cube.icon, CUBE_SIZE / 2, deckTop + 6, cube.housing.dark);
    // three buttons (B5: functional — play / greet / power)
    const rects = buttonRects(cube);
    for (let i = 0; i < 3; i++) {
      const r = rects[i];
      const pressed = cube._pressBtn === i && cube._pressT > 0;
      drawButton(r.x, r.y, r.w, r.h, pressed);
    }
    // tiny character name under the buttons
    ctx.font = '8px "Courier New", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = cube.housing.translucent ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)';
    ctx.fillText(cube.housing.name.toUpperCase(), CUBE_SIZE / 2, rects[0].y + rects[0].h + 9);

    // collector series badge, top-left corner
    drawSeriesBadge(cube);

    ctx.restore();

    // ---- physical-world chrome drawn outside the cube's local transform ----
    if (cube.toast) drawToastChip(cube, x, y);        // C2: floating game-name chip
    if (cube._hover) drawRemoveChip(cube, x, y);       // B6: hover ✕ chip
  }

  // B5: the three control-deck button rects, shared by drawCube (rendering)
  // and the pointerdown hit-test — single source of truth for hit geometry.
  function buttonRects(cube) {
    const deckTop = SCREEN_Y + SCREEN_PX + WELL + 1;
    const bw = 34, bh = 11, gap = 8, total = bw * 3 + gap * 2;
    const bx0 = (CUBE_SIZE - total) / 2, by = deckTop + 15;
    const out = [];
    for (let i = 0; i < 3; i++) out.push({ x: bx0 + i * (bw + gap), y: by, w: bw, h: bh });
    return out;
  }

  // small molded pictograms for the control-deck game icon
  function drawGameIcon(kind, cx, cy, col) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const F = () => ctx.fill(), St = () => ctx.stroke();
    const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); };
    switch (kind) {
      case 'heli':
        ctx.beginPath(); ctx.ellipse(-1, 1, 6, 3.2, 0, 0, 7); F();
        ctx.beginPath(); ctx.moveTo(5, 1); ctx.lineTo(11, 0); ctx.lineTo(11, 2); ctx.closePath(); F();       // tail
        ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(7, -4); St();                                        // rotor
        ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(-1, -1); St();
        ctx.beginPath(); ctx.moveTo(11, -2); ctx.lineTo(11, 2); St(); break;                                 // tail rotor
      case 'taxi':
        ctx.beginPath(); ctx.moveTo(-9, 3); ctx.lineTo(-7, -1); ctx.lineTo(-3, -3); ctx.lineTo(4, -3);
        ctx.lineTo(8, -1); ctx.lineTo(9, 3); ctx.closePath(); F();
        ctx.fillStyle = '#cfcabb'; circle(-5, 4, 2); F(); circle(5, 4, 2); F(); break;
      case 'ball': circle(0, 0, 5); St(); ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); St(); break;
      case 'note': circle(-3, 3, 2.4); F(); ctx.beginPath(); ctx.moveTo(-1, 3); ctx.lineTo(-1, -5); ctx.lineTo(4, -6); ctx.lineTo(4, 2); St(); circle(3, 2, 2.4); F(); break;
      case 'star': { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 6; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); F(); break; }
      case 'flame': ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(5, -1, 3, 3); ctx.quadraticCurveTo(1, 6, 0, 5); ctx.quadraticCurveTo(-1, 6, -3, 3); ctx.quadraticCurveTo(-5, -1, 0, -6); ctx.closePath(); F(); break;
      case 'mug': ctx.beginPath(); ctx.rect(-5, -3, 8, 8); F(); ctx.beginPath(); ctx.arc(4, 1, 3, -1.4, 1.4); St(); ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-3, -4); ctx.moveTo(0, -6); ctx.lineTo(0, -4); St(); break;
      case 'wrench': ctx.save(); ctx.rotate(-0.6); ctx.beginPath(); ctx.rect(-1.5, -6, 3, 12); F(); circle(0, -6, 3.2); St(); circle(0, 6, 3.2); St(); ctx.restore(); break;
      case 'hammer': ctx.beginPath(); ctx.rect(-1.5, -2, 3, 9); F(); ctx.beginPath(); ctx.rect(-6, -6, 12, 4); F(); break;
      case 'dumbbell': ctx.beginPath(); ctx.rect(-6, -1.5, 12, 3); F(); ctx.beginPath(); ctx.rect(-8, -4, 3, 8); F(); ctx.beginPath(); ctx.rect(5, -4, 3, 8); F(); break;
      case 'badge': { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 6; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); F(); ctx.fillStyle = '#cfcabb'; circle(0, 0, 1.6); F(); break; }
      case 'paper': ctx.beginPath(); ctx.rect(-4, -6, 8, 12); F(); ctx.strokeStyle = '#cfcabb'; ctx.beginPath(); for (let yy = -3; yy <= 3; yy += 2) { ctx.moveTo(-2.5, yy); ctx.lineTo(2.5, yy); } St(); break;
      case 'parcel': ctx.beginPath(); ctx.rect(-5, -5, 10, 10); F(); ctx.strokeStyle = '#cfcabb'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); St(); break;
      case 'bat': ctx.save(); ctx.rotate(-0.6); ctx.beginPath(); ctx.moveTo(-1.5, 6); ctx.lineTo(-3, -5); ctx.quadraticCurveTo(0, -8, 3, -5); ctx.lineTo(1.5, 6); ctx.closePath(); F(); ctx.restore(); break;
      case 'hoop': circle(0, 1, 5); St(); ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(-3, 6); ctx.moveTo(5, 1); ctx.lineTo(3, 6); ctx.moveTo(0, 1); ctx.lineTo(0, 6); St(); break;
      case 'board': ctx.beginPath(); ctx.ellipse(0, -1, 8, 2.2, 0, 0, 7); F(); ctx.fillStyle = '#cfcabb'; circle(-5, 3, 1.6); F(); circle(5, 3, 1.6); F(); break;
      case 'drop': ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(5, 1, 0, 5); ctx.quadraticCurveTo(-5, 1, 0, -6); ctx.closePath(); F(); break;
      case 'rocket': ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(4, -2, 3, 4); ctx.lineTo(-3, 4); ctx.quadraticCurveTo(-4, -2, 0, -7); ctx.closePath(); F(); ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(-6, 6); ctx.lineTo(-2, 5); ctx.moveTo(3, 3); ctx.lineTo(6, 6); ctx.lineTo(2, 5); F(); break;
      case 'paw': circle(0, 3, 3.2); F(); circle(-4, -1, 1.6); F(); circle(-1.4, -4, 1.6); F(); circle(1.4, -4, 1.6); F(); circle(4, -1, 1.6); F(); break;
      case 'flag': ctx.beginPath(); ctx.moveTo(-4, 7); ctx.lineTo(-4, -7); St(); ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(5, -4); ctx.lineTo(-4, -1); ctx.closePath(); F(); break;
      case 'loop': circle(0, 0, 5); St(); circle(0, 0, 2.2); St(); break;
      default: circle(0, 0, 4); St();
    }
    ctx.restore();
  }

  function seriesTag(def) {
    if (def.se) return 'S.E.';
    if (def.region === 'JP') return 'JP';
    const s = def.series;
    if (s.startsWith('Series 1')) return 'S1';
    if (s.startsWith('Series 2')) return 'S2';
    if (s.startsWith('Series 3')) return 'S3';
    if (s.startsWith('Series 4')) return 'S4';
    if (s.startsWith('MODs')) return 'MOD';
    if (s.startsWith('Jumbo')) return 'JMB';
    return '?';
  }
  // C1: a solid collector sticker — cream on plastic, gold for Special
  // Editions — legible against every housing colour (the old translucent
  // black chip washed out on dark plastics).
  function drawSeriesBadge(cube) {
    const tag = seriesTag(cube.housing);
    ctx.font = 'bold 9px "Courier New", monospace';
    const w = ctx.measureText(tag).width + 9, bx = 7, by = 6, h = 13;
    roundRect(ctx, bx, by, w, h, 3);
    ctx.fillStyle = cube.housing.se ? '#ffe14d' : '#efe9d6';
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    ctx.fillStyle = cube.housing.se ? '#4a3200' : '#33301f';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(tag, bx + 4, by + h / 2 + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  // C2: the molded deck icon never changes (it's molded plastic) — the game
  // name instead floats as a cream sticker chip above the cube, sliding down
  // 4px and fading in over its first 120ms, then fading out at end of life.
  function drawToastChip(cube, x, y) {
    const toast = cube.toast;
    const age = toast.dur - toast.t;                 // ms since it appeared
    const fadeIn = clamp(age / 120, 0, 1);
    const fadeOut = clamp(toast.t / 250, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    if (alpha <= 0) return;
    const slide = (1 - fadeIn) * -4;                  // slides down into place
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 10px "Courier New", monospace';
    const text = '▶ ' + toast.text.toUpperCase();
    const w = ctx.measureText(text).width + 14, h = 16;
    const cx = x + CUBE_SIZE / 2;
    let cy = y - 12 + slide;
    if (cy < h / 2 + 2) cy = h / 2 + 2;               // keep chip from clipping off canvas top
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 4);
    ctx.fillStyle = '#efe9d6'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    ctx.fillStyle = '#33301f';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }

  // B6: a small round ✕ chip at the cube's top-right housing corner while
  // hovered — click removes the cube. Shares geometry with the pointerdown
  // hit-test via the same (x, y) the caller used to draw the housing.
  function removeChipRect(x, y) {
    return { cx: x + CUBE_SIZE - 12, cy: y + 12, r: 7 };
  }
  function drawRemoveChip(cube, x, y) {
    const { cx, cy, r } = removeChipRect(x, y);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#7a1f1a'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    ctx.strokeStyle = '#f2ece0'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const d = 2.6;
    ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
    ctx.restore();
  }

  function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r + 255 * amt), 0, 255);
    g = clamp(Math.round(g + 255 * amt), 0, 255);
    b = clamp(Math.round(b + 255 * amt), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  // B7: a small "magnetic latch" straddling each connected seam, drawn AFTER
  // all cubes so it's visible when they sit flush (the old glow drew under
  // the cubes and was invisible). On a *new* connection the cube gets a brief
  // connFlash pulse — a soft glow around the latch that fades out.
  function drawConnectionLatch(cube) {
    const pulse = cube.connFlash > 0 ? cube.connFlash / 600 : 0;
    for (const edge of ['right', 'bottom']) {
      if (!cube.conn[edge]) continue;
      const vertical = edge === 'right';
      const w = vertical ? 10 : 28, h = vertical ? 28 : 10;
      const cx = vertical ? cube.x + CUBE_SIZE : cube.x + CUBE_SIZE / 2;
      const cy = vertical ? cube.y + CUBE_SIZE / 2 : cube.y + CUBE_SIZE;
      const x = cx - w / 2, y = cy - h / 2;
      if (pulse > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,217,77,0.9)';
        ctx.shadowBlur = 14 * pulse;
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        roundRect(ctx, x, y, w, h, 4);
        ctx.fillStyle = '#ffd94d'; ctx.fill();
        ctx.restore();
      }
      roundRect(ctx, x, y, w, h, 4);
      ctx.fillStyle = '#ffd94d'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    }
  }

  function render(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CSS_W, CSS_H);
    for (const cube of cubes) drawCube(cube, dt);
    for (const cube of cubes) drawConnectionLatch(cube);   // physical-world chrome, drawn on top
  }

  // ================================================================= INPUT
  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (CSS_W / r.width), y: (e.clientY - r.top) * (CSS_H / r.height) };
  }
  function cubeAt(x, y) {
    for (let i = cubes.length - 1; i >= 0; i--) {
      const c = cubes[i];
      if (x >= c.x && x <= c.x + CUBE_SIZE && y >= c.y && y <= c.y + CUBE_SIZE) return c;
    }
    return null;
  }
  function findSnap(cube, tx, ty) {
    let best = null;
    for (const o of cubes) {
      if (o === cube) continue;
      const targets = [
        { x: o.x + CUBE_SIZE, y: o.y }, { x: o.x - CUBE_SIZE, y: o.y },
        { x: o.x, y: o.y + CUBE_SIZE }, { x: o.x, y: o.y - CUBE_SIZE },
      ];
      for (const t of targets) {
        const d = Math.hypot(tx - t.x, ty - t.y);
        if (d >= SNAP || (best && d >= best.d)) continue;
        // solid plastic: a slot another cube already sits in can't take a
        // second one (stacked cubes made recomputeConnections asymmetric).
        const taken = cubes.some(k => k !== cube && Math.abs(k.x - t.x) < TOL && Math.abs(k.y - t.y) < TOL);
        if (!taken) best = { x: t.x, y: t.y, d };
      }
    }
    return best;
  }

  // B5: hit-test the three deck buttons in cube-local coordinates, sharing
  // buttonRects() with the renderer so hit geometry never drifts from paint.
  function buttonAt(cube, px, py) {
    const lx = px - cube.x, ly = py - cube.y;
    const rects = buttonRects(cube);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return i;
    }
    return -1;
  }
  // B6: hit-test the hover ✕ removal chip in world coordinates.
  function removeChipAt(cube, px, py) {
    const { cx, cy, r } = removeChipRect(cube.x, cube.y);
    return Math.hypot(px - cx, py - cy) <= r + 2;
  }

  function pressButton(cube, i) {
    cube._pressBtn = i; cube._pressT = 150;
    // in game mode the deck is the controller: 0 quits, 1/2 are inputs
    if (cube.game) {
      if (i === 0) { endGame(cube, true); sfx.poke(); return; }
      if (cube.game.phase === 'play') cube.game.pressed = i;   // judged next tick
      wakeCube(cube);
      return;
    }
    if (i === 2) {                                    // power: sleep toggle
      if (cube.asleep) wakeCube(cube);                // B3: wake plays the power-flash
      else { cube.asleep = true; cube.boot = null; }
      sfx.poke();
      return;
    }
    wakeCube(cube);
    // exclude figures mid-doorway (see pokeCube) — hijacking one strands it
    const occ = occupantsOf(cube).filter(c => c.state !== 'transfer' && c.state !== 'entering');
    if (i === 0) {                                    // start this cube's game
      startGame(cube);
    } else if (i === 1) {                              // greet: wave + note emote
      if (occ.length) {
        const ch = pick(occ);
        ch.act = null; ch.state = 'acting'; setAnim(ch, 'wave', true);
        ch.emote = { icon: 'note', t: 6 };
        ch.think = 6;
      }
      sfx.greet();
    }
  }

  // B6: remove a cube — characters homed there are deleted outright; visiting
  // characters currently inside it are sent home via the existing dissolve
  // logic (they can't dissolve into a cube that no longer exists, so we route
  // them home first, then drop the cube).
  function removeCube(cube) {
    for (const ch of chars.slice()) {
      if (ch.homeId === cube.id) {
        const idx = chars.indexOf(ch);
        if (idx >= 0) chars.splice(idx, 1);
        for (const c of cubes) {
          const oi = c.occupants.indexOf(ch.id);
          if (oi >= 0) c.occupants.splice(oi, 1);
        }
      }
    }
    for (const ch of chars) {
      if (ch.cubeId === cube.id && ch.homeId !== cube.id) sendHome(ch);
    }
    const ci = cubes.indexOf(cube);
    if (ci >= 0) cubes.splice(ci, 1);
    recomputeConnections();
    dissolveOrphans();
    markDirty();
    sfx.dissolve();
  }

  canvas.addEventListener('pointerdown', e => {
    ensureAudio();
    const p = toLocal(e);
    const cube = cubeAt(p.x, p.y);
    if (!cube) return;

    // B6: click the hover removal chip — never starts a drag or counts as a poke.
    if (cube._hover && removeChipAt(cube, p.x, p.y)) { removeCube(cube); return; }
    // B5: click a deck button — never starts a drag or counts as a poke.
    const btn = buttonAt(cube, p.x, p.y);
    if (btn >= 0) { pressButton(cube, btn); return; }

    canvas.setPointerCapture(e.pointerId);
    cubes.splice(cubes.indexOf(cube), 1); cubes.push(cube);
    drag = { cube, ox: p.x - cube.x, oy: p.y - cube.y, moved: false, sx: p.x, sy: p.y,
      conn: connectionCount(), lastX: p.x, lastY: p.y, lastT: performance.now(), shake: 0 };
    canvas.classList.add('dragging');
    wakeCube(cube);
  });

  canvas.addEventListener('pointermove', e => {
    const p = toLocal(e);
    // B6: track hover (even when not dragging) so the removal chip only
    // shows on the cube under the pointer.
    if (!drag) {
      const hoverCube = cubeAt(p.x, p.y);
      for (const c of cubes) c._hover = (c === hoverCube);
      return;
    }
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 5) drag.moved = true;
    if (!drag.moved) return;

    // shake detection while dragging → dizzy occupants
    const now = performance.now(), dtm = Math.max(1, now - drag.lastT);
    const vx = (p.x - drag.lastX) / dtm, vy = (p.y - drag.lastY) / dtm;
    const sp = Math.hypot(vx, vy);
    drag.shake = drag.shake * 0.85 + sp * 0.15;
    if (drag.shake > 2.2) {
      if (drag.cube.game) endGame(drag.cube, false);
      for (const ch of drag.cube.occupants.map(cubeById2)) if (ch && ch.dizzy <= 0) { ch.act = null; ch.yOff = 0; ch.dizzy = 9; ch.state = 'dizzy'; setAnim(ch, 'dizzy'); ch.x = clamp(ch.x, 5, 27); ch.transPhase = null; }
      drag.cube.wiggle = 260;
      if (Math.random() < 0.06) sfx.dizzy();
    }
    drag.lastX = p.x; drag.lastY = p.y; drag.lastT = now;

    let tx = clamp(p.x - drag.ox, 0, Math.max(0, CSS_W - CUBE_SIZE));
    let ty = clamp(p.y - drag.oy, 0, Math.max(0, CSS_H - CUBE_SIZE));
    const snap = findSnap(drag.cube, tx, ty);
    if (snap) { tx = clamp(snap.x, 0, Math.max(0, CSS_W - CUBE_SIZE)); ty = clamp(snap.y, 0, Math.max(0, CSS_H - CUBE_SIZE)); }
    drag.cube.x = tx; drag.cube.y = ty;

    recomputeConnections();
    const nc = connectionCount();
    if (nc > drag.conn) { sfx.connect(); for (const c of cubes) wakeCube(c); }
    drag.conn = nc;
    dissolveOrphans();
  });
  canvas.addEventListener('pointerleave', () => { for (const c of cubes) c._hover = false; });

  function cubeById2(id) { return chars.find(c => c.id === id); }

  function endDrag() {
    if (!drag) return;
    canvas.classList.remove('dragging');
    if (!drag.moved) pokeCube(drag.cube);
    else { recomputeConnections(); dissolveOrphans(); markDirty(); }
    drag = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // -------------------------------------------------------------------- UI
  addBtn.addEventListener('click', () => { ensureAudio(); if (addCube()) sfx.add(); });
  shakeBtn.addEventListener('click', shakeAll);
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? 'Muted' : 'Sound';
    muteBtn.classList.toggle('is-on', !muted);
    if (!muted) { ensureAudio(); beep(700, 0.05); }
  });
  resetBtn.addEventListener('click', () => {
    if (!window.confirm('Clear the sandbox and start over?')) return;
    // C5: clear arrays IN PLACE (not reassign) so window.__cw.cubes/chars keep
    // pointing at the live arrays after a reset.
    cubes.length = 0; chars.length = 0; cubeSeq = charSeq = 1; rosterBag = [];
    initWorld();
    clearSave();      // reset wipes the save; the next interaction re-saves
  });

  // ------------------------------------------------------------------ boot
  function resize() {
    const r = stage.getBoundingClientRect();
    CSS_W = Math.max(320, Math.round(r.width));
    // Fill the viewport; grow taller so the grid can spill into a scroll region.
    let needed = Math.round(r.height);
    for (const c of cubes) needed = Math.max(needed, c.y + CUBE_SIZE + GAP);
    CSS_H = Math.max(Math.round(r.height), needed);
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(CSS_W * dpr);
    canvas.height = Math.round(CSS_H * dpr);
    canvas.style.width = CSS_W + 'px';
    canvas.style.height = CSS_H + 'px';
    ctx.imageSmoothingEnabled = false;
    buildMatrixTile();
    for (const c of cubes) {
      c.x = clamp(c.x, 0, Math.max(0, CSS_W - CUBE_SIZE));
      c.y = clamp(c.y, 0, Math.max(0, CSS_H - CUBE_SIZE));
    }
    recomputeConnections();
  }
  window.addEventListener('resize', resize);

  function tick(t) {
    if (last == null) last = t;
    const dt = Math.min(t - last, 60); last = t;
    updateChars(dt);
    updateCubes(dt);
    render(dt);
    requestAnimationFrame(tick);
  }

  resize();
  if (!loadWorld()) initWorld();
  resize();           // grow the canvas to fit a restored layout
  requestAnimationFrame(tick);

  // ---- P0.1: in-page invariant selftest -----------------------------------
  // Side-effect-free (composePlane rewrites cube.plane, which every render
  // frame redoes anyway). Returns { pass, failures } — run after any change
  // to prove the simulation is still coherent.
  function selftest() {
    const failures = [];
    const fail = m => failures.push(m);
    const finite = v => typeof v === 'number' && isFinite(v);
    const EDGES = ['top', 'bottom', 'left', 'right'];

    const cubeIds = new Set();
    for (const c of cubes) { if (cubeIds.has(c.id)) fail(`duplicate cube id ${c.id}`); cubeIds.add(c.id); }

    for (const c of cubes) {
      // (a) connections are symmetric and the seam really is flush
      for (const edge of EDGES) {
        const nId = c.conn[edge];
        if (nId == null) continue;
        const n = cubeById(nId);
        if (!n) { fail(`cube ${c.id}: conn.${edge} -> missing cube ${nId}`); continue; }
        if (n.conn[OPPOSITE[edge]] !== c.id) fail(`cube ${c.id}: conn.${edge}=${nId} not mirrored back`);
        const gap = edge === 'right' ? n.x - (c.x + CUBE_SIZE)
                  : edge === 'left' ? c.x - (n.x + CUBE_SIZE)
                  : edge === 'bottom' ? n.y - (c.y + CUBE_SIZE)
                  : c.y - (n.y + CUBE_SIZE);
        const lap = (edge === 'left' || edge === 'right')
          ? overlap(c.y, c.y + CUBE_SIZE, n.y, n.y + CUBE_SIZE)
          : overlap(c.x, c.x + CUBE_SIZE, n.x, n.x + CUBE_SIZE);
        if (Math.abs(gap) >= TOL) fail(`cube ${c.id}: ${edge} seam not flush (gap ${gap.toFixed(2)})`);
        if (lap < CUBE_SIZE * 0.85) fail(`cube ${c.id}: ${edge} seam under-lapped (${Math.round(lap)}px)`);
      }
      // (d) cube numerics; (f) door and blind ranges
      for (const k of ['x', 'y', 'wiggle', 'idle', 'connFlash', 'tickT', 'ticks', 'blind'])
        if (!finite(c[k])) fail(`cube ${c.id}.${k} not finite (${c[k]})`);
      for (const edge of EDGES) {
        const d = c.door[edge];
        if (!Number.isInteger(d) || d < 0 || d > DOOR_STEPS) fail(`cube ${c.id}: door.${edge}=${d} outside 0..${DOOR_STEPS}`);
      }
      if (!Number.isInteger(c.blind) || c.blind < 0 || c.blind > LCD) fail(`cube ${c.id}: blind=${c.blind} outside 0..${LCD}`);
      if (c.boot && (!finite(c.boot.t) || !finite(c.boot.dur))) fail(`cube ${c.id}: boot timer corrupt`);
      // (g) occupancy cap
      if (c.occupants.length > MAX_OCCUPANTS) fail(`cube ${c.id}: ${c.occupants.length} occupants > ${MAX_OCCUPANTS}`);
      // live game <-> player linkage
      if (c.game) {
        const g = c.game;
        if (!['countdown', 'play', 'over'].includes(g.phase)) fail(`cube ${c.id}: game phase '${g.phase}'`);
        if (!MECHANICS[g.kind]) fail(`cube ${c.id}: unknown game kind '${g.kind}'`);
        for (const k of ['t', 'score', 'misses', 'speed', 'bob'])
          if (!finite(g[k])) fail(`cube ${c.id}: game.${k} not finite (${g[k]})`);
        const p = chars.find(k => k.id === g.charId);
        if (!p || p.cubeId !== c.id || p.state !== 'gaming')
          fail(`cube ${c.id}: game player ${g.charId} missing/absent/not gaming`);
      }
    }

    // (b) every character resolves, and occupant lists agree with cubeId
    const seat = new Map();                    // char id -> cube id it's seated in
    for (const c of cubes)
      for (const id of c.occupants) {
        if (seat.has(id)) fail(`char ${id} listed in cubes ${seat.get(id)} and ${c.id}`);
        seat.set(id, c.id);
      }
    for (const ch of chars) {
      if (!cubeById(ch.homeId)) fail(`char ${ch.id}: homeId ${ch.homeId} missing`);
      if (!cubeById(ch.cubeId)) fail(`char ${ch.id}: cubeId ${ch.cubeId} missing`);
      if (seat.get(ch.id) !== ch.cubeId) fail(`char ${ch.id}: cubeId=${ch.cubeId} but seated in ${seat.get(ch.id)}`);
      seat.delete(ch.id);
      for (const k of ['x', 'yOff', 'frame', 'think', 'dizzy', 'trickT', 'trickDur'])
        if (!finite(ch[k])) fail(`char ${ch.id}.${k} not finite (${ch[k]})`);
      if (ch.facing !== 1 && ch.facing !== -1) fail(`char ${ch.id}: facing=${ch.facing}`);
      const seq = CW_ANIM[ch.anim] || CW_ANIM.idle;
      if (!Number.isInteger(ch.frame) || ch.frame < 0 || ch.frame >= seq.length)
        fail(`char ${ch.id}: frame ${ch.frame} outside anim '${ch.anim}' (len ${seq.length})`);
      if (ch.state === 'gaming') {
        const k = cubeById(ch.cubeId);
        if (!k || !k.game || k.game.charId !== ch.id) fail(`char ${ch.id}: gaming without a live game`);
      }
      // (c) position sanity: only mid-portal states may poke past the panel
      // edge; a settled idle figure sits inside the 5..27 lane band.
      if (ch.state !== 'transfer' && ch.state !== 'entering') {
        if (ch.x < -1 || ch.x > LCD) fail(`char ${ch.id}: x=${ch.x} off-screen in state '${ch.state}'`);
        if (ch.state === 'idle' && ch.anim !== 'walk' && (ch.x < 4.5 || ch.x > 27.5))
          fail(`char ${ch.id}: settled at x=${ch.x} outside the 5..27 band`);
        if (ch.yOff !== 0) fail(`char ${ch.id}: yOff=${ch.yOff} while grounded in state '${ch.state}'`);
      } else {
        if (ch.x < -8 || ch.x > LCD + 8) fail(`char ${ch.id}: x=${ch.x} beyond portal reach`);
        if (ch.yOff < -24 || ch.yOff > 16) fail(`char ${ch.id}: yOff=${ch.yOff} outside hatch travel`);
      }
    }
    for (const id of seat.keys()) fail(`cube occupant ${id} has no character`);

    // (e) plane composition is deterministic within a tick
    for (const c of cubes) {
      const a = composePlane(c).slice();
      const b = composePlane(c);
      for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i]) { fail(`cube ${c.id}: plane differs between same-tick composes`); break; }
    }

    return { pass: failures.length === 0, failures };
  }

  // debug hook
  window.__cw = { cubes, chars, CSS_W: () => CSS_W, CSS_H: () => CSS_H,
    // advance every cube by exactly n LCD ticks, deterministically — calls
    // the same tickCube() path the real rAF loop uses, bypassing the
    // accumulator so tests don't depend on wall-clock frame timing.
    ff: n => { for (let i = 0; i < n; i++) for (const cube of cubes) { cube.ticks++; tickCube(cube); } },
    recompute: recomputeConnections,
    selftest,
    dissolve: dissolveOrphans,
    shakeAll,
    addCube,
    poke: pokeCube,
    findSnap,
    saveNow: saveWorld,
    press: pressButton,
    forceTransfer: (charIdx, edge) => { const ch = chars[charIdx]; beginTransfer(ch, cubeById(ch.cubeId), edge); },
    startAct: (charIdx, key) => startAct(chars[charIdx], key),
    planeAscii: (cubeIdx) => {
      const plane = composePlane(cubes[cubeIdx]);
      let out = '';
      for (let y = 0; y < LCD; y++) { for (let x = 0; x < LCD; x++) out += plane[y * LCD + x] ? '#' : '.'; out += '\n'; }
      return out;
    },
    portalAscii: (edge, open) => {
      const plane = new Uint8Array(LCD * LCD);
      drawPortal(plane, edge, open);
      let out = '';
      for (let y = 0; y < LCD; y++) { for (let x = 0; x < LCD; x++) out += plane[y * LCD + x] ? '#' : '.'; out += '\n'; }
      return out;
    },
    trickAscii: (key, ph) => {
      const plane = new Uint8Array(LCD * LCD);
      const ch = { x: 16, facing: 1, trick: key, trickT: Math.round(ph * TRICK_TICKS), trickDur: TRICK_TICKS };
      drawTrick(plane, ch);
      let out = '';
      for (let y = 0; y < LCD; y++) { for (let x = 0; x < LCD; x++) out += plane[y * LCD + x] ? '#' : '.'; out += '\n'; }
      return out;
    } };
})();
