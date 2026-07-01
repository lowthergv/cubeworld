// ============================================================================
// Radica Cube World — emulator constants & content
// Verified against reference/SPEC.md and reference/cube_world_types.txt
// (full SKU list: characters, signature games, Special Editions).
// ============================================================================

// ---- LCD panel ----
const LCD = 32;                 // native dot-matrix resolution (32 x 32), from TCRF pixel test
const DOT = 5;                  // on-screen size of one LCD dot (px), before canvas DPR scaling
const SCREEN_PX = LCD * DOT;    // 160

// Grey-green STN LCD palette. ON = dark ink, OFF = pale panel.
const LCD_OFF   = '#9aa886';
const LCD_OFF_HI= '#a7b492';
const LCD_ON    = '#20241a';
const LCD_GLASS = 'rgba(220,235,205,0.10)';

// ---- Cube casing (matches the real recessed-screen + button-deck housing) ----
const SCREEN_X = 30;            // side bezel: gap from cube edge to screen
const SCREEN_Y = 14;            // top bezel: gap from cube top to screen
const DECK_H = 46;              // control deck (game icon + 3 buttons) below screen
const CUBE_SIZE = SCREEN_Y + SCREEN_PX + DECK_H;   // 220 — square footprint
const WELL = 8;                 // recessed dark screen-well thickness

// ---- Character placement on the 32x32 grid ----
const FLOOR_Y = 30;             // baseline row the feet stand on
const CENTER_X = 16;

// ---- Molded game-icon on each cube's control deck (keyed by trick) ----
const GAME_ICON = {
  scoop: 'paw',   slim: 'flag',    dodger: 'ball',  whip: 'loop',
  mic: 'note',    hans: 'dumbbell',handy: 'hammer', dusty: 'mug',
  chief: 'badge', sparky: 'flame', toner: 'paper',  dash: 'parcel',
  slugger: 'bat', kicks: 'ball',   slam: 'hoop',    grinder: 'board',
  splash: 'drop', scifi: 'rocket', hiphop: 'note',  dart: 'star',
  global: 'heli', blockbash: 'taxi',
};

// ---- Signature "trick" animations -----------------------------------------
// Each character has a rare signature move tied to its real game (per the SKU
// doc). `prop` selects an animated LCD prop drawn in main.js; `body` maps to an
// existing traced pose sequence; `game` is the real game name shown on-screen.
const TRICKS = {
  scoop:   { game: 'Dog Catch',            prop: 'dog',    body: 'idle'  },
  slim:    { game: 'Jump Over The Alien',  prop: 'alien',  body: 'jump'  },
  dodger:  { game: "Headers Keep 'Em Up",  prop: 'header', body: 'idle'  },
  whip:    { game: 'Skipping',             prop: 'rope',   body: 'jump'  },
  mic:     { game: 'Catch The Music',      prop: 'notes',  body: 'idle'  },
  hans:    { game: 'Break-Wall Karate',    prop: 'block',  body: 'mad'   },
  handy:   { game: 'Hammer The Mole',      prop: 'mole',   body: 'stretch'},
  dusty:   { game: 'Fly-Killer Fury',      prop: 'fly',    body: 'mad'   },
  chief:   { game: 'Door Breaker',         prop: 'door',   body: 'mad'   },
  sparky:  { game: 'Hose That Fire',       prop: 'fire',   body: 'idle'  },
  toner:   { game: 'Catch The Paperwork',  prop: 'paper',  body: 'idle'  },
  dash:    { game: 'Dog-Bite Delivery',    prop: 'dogbite',body: 'walk'  },
  slugger: { game: 'Hit That Ball',        prop: 'bat',    body: 'mad'   },
  kicks:   { game: 'Penalty Shootout',     prop: 'ball',   body: 'kick'  },
  slam:    { game: 'Slam Dunk',            prop: 'hoop',   body: 'jump'  },
  grinder: { game: 'Skateboard Stunts',    prop: 'board',  body: 'idle'  },
  splash:  { game: 'Underwater Adventure', prop: 'water',  body: 'idle'  },
  scifi:   { game: 'Journey Into Space',   prop: 'rocket', body: 'idle'  },
  hiphop:  { game: 'Face The Music',       prop: 'notes',  body: 'dance' },
  dart:    { game: 'Snake Charmer',        prop: 'snake',  body: 'idle'  },
  global:  { game: 'Around The World',     prop: 'globe',  body: 'idle'  },
  blockbash:{game: 'City Taxi',            prop: 'taxi',   body: 'idle'  },
};

// ---- The full roster ------------------------------------------------------
// name/series/quirk/game from reference/cube_world_types.txt. `base`/`dark` are
// period-bright plastic colours (documented ones matched: Scoop orange, Chief
// cop-blue, Slugger light-red, Dart purple, Block Bash yellow-orange, Global
// blue). `se` = translucent Special Edition (clear-craze). `region` for Bandai.
const ROSTER = [
  // -- Series 1 (2005) --
  { id: 'scoop',  name: 'Scoop',  series: 'Series 1 · 2005', quirk: 'plays with his dog Spot', trick: 'scoop',  base: '#f0902c', dark: '#a3540f' },
  { id: 'slim',   name: 'Slim',   series: 'Series 1 · 2005', quirk: 'plays with a stick',      trick: 'slim',   base: '#5fb843', dark: '#356f22' },
  { id: 'dodger', name: 'Dodger', series: 'Series 1 · 2005', quirk: 'keeps the ball up',       trick: 'dodger', base: '#e23b3b', dark: '#8f2020' },
  { id: 'whip',   name: 'Whip',   series: 'Series 1 · 2005', quirk: 'skips his rope',          trick: 'whip',   base: '#3aa0e0', dark: '#1b5f92' },
  // -- Series 2 (2006) --
  { id: 'mic',    name: 'Mic',    series: 'Series 2 · 2006', quirk: 'the top musician',        trick: 'mic',    base: '#9a54cf', dark: '#5a2a86' },
  { id: 'hans',   name: 'Hans',   series: 'Series 2 · 2006', quirk: 'the fitness freak',       trick: 'hans',   base: '#ef6d38', dark: '#a3411a' },
  { id: 'handy',  name: 'Handy',  series: 'Series 2 · 2006', quirk: "the handy man",           trick: 'handy',  base: '#f2c320', dark: '#a6820d' },
  { id: 'dusty',  name: 'Dusty',  series: 'Series 2 · 2006', quirk: 'the clean freak',         trick: 'dusty',  base: '#2fbfa8', dark: '#17715f' },
  // -- Series 3 (2007) --
  { id: 'chief',  name: 'Chief',  series: 'Series 3 · 2007', quirk: 'the Cube World cop',      trick: 'chief',  base: '#3f6fd0', dark: '#24418a' },
  { id: 'sparky', name: 'Sparky', series: 'Series 3 · 2007', quirk: 'the fireman',             trick: 'sparky', base: '#e0402a', dark: '#96231a' },
  { id: 'toner',  name: 'Toner',  series: 'Series 3 · 2007', quirk: 'the office worker',       trick: 'toner',  base: '#7c8aa0', dark: '#454f63' },
  { id: 'dash',   name: 'Dash',   series: 'Series 3 · 2007', quirk: 'the delivery guy',        trick: 'dash',   base: '#c98a3f', dark: '#7a4f1a' },
  // -- Jumbo cubes (2007) --
  { id: 'global', name: 'Global Get-A-Way', series: 'Jumbo · 2007', quirk: 'travels the world', trick: 'global', base: '#3f8fd0', dark: '#23568a', jumbo: true },
  { id: 'blockbash', name: 'Block Bash', series: 'Jumbo · 2007', quirk: 'cruises the city',     trick: 'blockbash', base: '#f2b21f', dark: '#a6760d', jumbo: true },
  // -- Series 4 · Sports (2008) --
  { id: 'slugger',name: 'Slugger',series: 'Series 4 · 2008', quirk: 'baseball slugger',        trick: 'slugger',base: '#f26b6b', dark: '#a63636' },
  { id: 'kicks',  name: 'Kicks',  series: 'Series 4 · 2008', quirk: 'soccer striker',          trick: 'kicks',  base: '#4fbf5a', dark: '#2a7a31' },
  { id: 'slam',   name: 'Slam',   series: 'Series 4 · 2008', quirk: 'basketball dunker',       trick: 'slam',   base: '#ef5a2a', dark: '#a3341a' },
  { id: 'grinder',name: 'Grinder',series: 'Series 4 · 2008', quirk: 'skateboard pro',          trick: 'grinder',base: '#7a6cc0', dark: '#463b82' },
  // -- Series 5 · MODs (2008/2009) --
  { id: 'splash', name: 'Splash', series: 'MODs · 2009', quirk: 'water MODifier',              trick: 'splash', base: '#33c0d9', dark: '#176b78' },
  { id: 'scifi',  name: 'Sci-Fi', series: 'MODs · 2009', quirk: 'sci-fi MODifier',             trick: 'scifi',  base: '#5b63c9', dark: '#2f3585' },
  { id: 'hiphop', name: 'Hip Hop',series: 'MODs · 2009', quirk: 'music MODifier',              trick: 'hiphop', base: '#d94b9e', dark: '#8a2560' },
  { id: 'dart',   name: 'Dart',   series: 'MODs · 2009', quirk: 'fairground MODifier',         trick: 'dart',   base: '#9a54cf', dark: '#5a2a86' },

  // -- Special Editions: translucent "clear-craze" cases (limited to 50K) --
  { id: 'mic',    name: 'Mic',    series: 'Special Edition', quirk: 'clear-case collector cube', trick: 'mic',    base: '#c9b8e6', dark: '#8f7fb4', se: true, translucent: true },
  { id: 'chief',  name: 'Chief',  series: 'Special Edition', quirk: 'clear-case collector cube', trick: 'chief',  base: '#b8c9ef', dark: '#7f8fc4', se: true, translucent: true },
  { id: 'sparky', name: 'Sparky', series: 'Special Edition', quirk: 'clear-case collector cube', trick: 'sparky', base: '#efb8b0', dark: '#c47f77', se: true, translucent: true },
  { id: 'dusty',  name: 'Dusty',  series: 'Special Edition', quirk: 'clear-case collector cube', trick: 'dusty',  base: '#b0e6df', dark: '#77c4b8', se: true, translucent: true },
  { id: 'global', name: 'Global Get-A-Way', series: 'Special Edition', quirk: 'clear jumbo collector cube', trick: 'global', base: '#b8dcef', dark: '#7fb0c4', se: true, translucent: true, jumbo: true },
  { id: 'blockbash', name: 'Block Bash', series: 'Special Edition', quirk: 'clear jumbo collector cube', trick: 'blockbash', base: '#f0dca0', dark: '#c2a45a', se: true, translucent: true, jumbo: true },

  // -- Ban Dai Japan variants: same games, different colour scheme / names --
  { id: 'sparky', name: 'Hot',    series: 'Ban Dai Japan', quirk: 'the fireman (JP)',          trick: 'sparky', base: '#e8562f', dark: '#9c331a', region: 'JP' },
  { id: 'slugger',name: 'Major',  series: 'Ban Dai Japan', quirk: 'baseball player (JP)',      trick: 'slugger',base: '#e04b6b', dark: '#962a44', region: 'JP' },
  { id: 'slam',   name: 'Pivot',  series: 'Ban Dai Japan', quirk: 'basketball player (JP)',    trick: 'slam',   base: '#e88a2f', dark: '#9c5a1a', region: 'JP' },
];

// ---- Small static prop bitmaps (LCD pixel art, '1' = ON) ------------------
// Animated props (rope, ball, notes, fly, snake, water, rocket) are procedural
// in main.js; these are the static stamps.
const PROP_BMP = {
  dog: ['0000110','0111110','1111111','0101010'],           // little dog (Spot)
  alien: ['01110','10101','11111','01010','10001'],          // hop-over alien
  board: ['0000000','1111111','0100010'],                    // skateboard deck+wheels
  taxi: ['0011100','0111110','1111111','0100010'],           // city taxi
  globe: ['01110','10101','11011','10101','01110'],           // globe w/ meridians
  paper: ['1111','1001','1001','1111'],                       // sheet of paperwork
  block: ['111','111','111'],                                 // karate break-block
  mole: ['0110','1111','1011','0110'],                        // mole in a hole
  door: ['1111','1001','1001','1111'],                        // door to break
  hoopNet: ['1000001','1000001','0100010','0011100'],         // basketball net
};

const MAX_CUBES = 9;
const MAX_OCCUPANTS = 4;
const SLEEP_IDLE = 40000;       // ms of no interaction before a cube dozes off
