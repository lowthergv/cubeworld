# Radica Cube World — Pixel-Accurate Recreation Spec

Verified from primary sources (official Radica/Mattel instruction manuals on service.mattel.com &
fabcollectibles.com, TCRF reverse-engineering captures, The Spriters Resource sprite rips,
contemporaneous 2005–2006 hands-on reviews). See `verified_research_claims.md` for the full
adversarially-verified claim set with citations.

## What it actually is
A **handheld electronic toy** (2005 Radica; Mattel after Oct 3 2006 acquisition; Bandai in Japan 2006).
Developed by Conceptioneering Ltd (Tony & Judie Ellis). NOT the 2011 Wollay/Picroma voxel video game.
Each cube houses a **stick-figure character** ("Stick Man" / "Stick People") living on a small
**monochrome LCD**. Cubes magnetically link so the stick people visit and interact across screens.

## Display (the thing to emulate exactly)
- **Native resolution: 32 × 32 pixels, monochrome dot-matrix LCD.** Confirmed by TCRF's own full-screen
  LCD test capture (all-on → per-row horizontal stripes → per-column vertical stripes → all-off; 31
  transitions across 32 px = every individual pixel toggles). Square screen, ~1.25" diagonal.
- **Two states per pixel only**: ON (dark) and OFF (pale). No greyscale, no color, no backlight.
- **LCD look**: dark near-black "on" pixels on a pale desaturated grey-green "off" background,
  with faint pixel-grid gaps and a subtle screen sheen. (Classic Tamagotchi/calculator STN LCD.)
- Emulate authentically: render on a 32×32 logical grid, upscale with nearest-neighbor (chunky pixels),
  optional dot-matrix gridlines and a slight ghosting/persistence on pixel changes.

## The character
- A **solid black stick-figure human**, standing, roughly full screen height (~24–30 px tall),
  centered. Round head, torso, two arms, two legs. Detailed enough to emote.
- **Frame-by-frame LCD animation**, choppy (~2–4 fps feel), not smooth interpolation.
- Real animation set ripped from the toy (see `cubeworld_stickman_spritesheet.png`):
  `Idle`, `Idle 2`, `Stretch`, `Sit`, `Mad`, `Scratch Head`, `Cube Turn`, `Dizzy/Sick`,
  `Ready to Sleep`, and a full **Sleep mode** (screen goes dark/inverts, a lying-down figure with
  floating "Z" letters). Manual claims "over 100 animations" per cube.
- Normally **one figure per screen**; up to **four** stick people share a screen when cubes are linked.

## NO scenery / NO diorama
There is **no background art, no themed 3D set, no jungle/space/undersea scene**. The screen shows only
the stick figure(s) on blank LCD. "Building a world" means physically connecting cubes, not decorating them.
(This is the biggest correction vs. the first draft.)

## Physical cube & casing
- Small plastic **cube**, rounded edges, ~4.5 cm. Square LCD on the front face.
- **3 push buttons** on the front (left / middle / right) — trigger games & animations.
- **Internal tilt/motion sensor** — shaking/tilting triggers reactions; too much motion makes the
  character **dizzy/sick**.
- Solid-color housings; **Special Editions** used translucent ("clear craze") plastic.
- Idle → **sleep after ~4 min** of no interaction, deeper sleep ~1 min later.

## Connection / linking mechanic (the heart of the toy)
- **Magnets on the sides** (contacts on the four side faces). Connect in **any horizontal or vertical
  pattern**, up to **16 cubes** in a network.
- On connect: characters notice each other, **wave hello**, then **TRANSFER** — a stick figure walks
  out of its own cube into a neighboring connected cube.
- When a figure leaves, a **window blind / Venetian blind lowers over the vacated screen** to show it's empty.
- Break the magnetic link → **DISSOLVE**: all transferred figures instantly return to their home cubes.
- Connected characters **play, pester, and protect** each other; some games need cubes arranged in a row.

## Series / lineup (for flavor, not scenery)
22 models across 6 series (2005–2008): S1 (Slim/Dodger/Scoop/Whip — each with a unique "Stick Game":
Pull Up / Bounce / Keep Away / Jump Rope), S2 & S3 character cubes, S4 Sports (Slugger/Kicks/Slam/Grinder),
S5 Mods (Dart/Hip Hop/Splash/Sci-fi — modifiers), and Places/Jumbo Cubes (Block Bash = city, Global
Getaways = vacation). Characters differ by name/color/personality, **not** by on-screen scenery.

## Reference assets in this folder
- `cubeworld_stickman_spritesheet.png` — 400×450 ripped animation sheet (The Spriters Resource). Art bible.
- `cubeworld_debug_spritesheet.png` — 232×100 debug-mode sheet.
- `lcd_test.gif` — TCRF full-screen LCD pixel test (proves 32×32).
- `debug_directions.gif`, `debug_checksum.gif` — TCRF test-mode captures (chunky pixel font, tilt square,
  connection "+" marker).
