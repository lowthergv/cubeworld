# Cube World — animation & housing catalog (from the two reference videos)

Observed from `Cube World (Radica) - 16 Cubes Powering On & Sleeping` and the
`Complete Collection Overview`. These are the toy's functional display behaviours;
reproduced with our own code in the emulator.

## Housing (the physical look to emulate)
- Rounded-corner plastic cube, bright solid colour (charcoal, lime, yellow, green,
  blue, red, grey, orange…). Subtle gloss.
- The LCD sits in a **deep, near-black recessed well** — screen looks sunken, with a
  dark inner bezel ring and inner shadow.
- Below the screen is a **control deck**: a small **molded game-icon** centered, and
  **three light-grey rounded buttons** in a row beneath it.
- The game-icon identifies the character's game: helicopter (travel jumbo), taxi/car
  (city jumbo), coffee mug, wrench, envelope/mail, star, flag/stick, flame/paw,
  musical note, ball, etc.
- **No visible magnetic nubs on the front** — connection is via hidden side magnets.
  (So: remove the front nubs; show connection via edge glow / tunnel only.)
- **Jumbo cubes** (Global Get-A-Way = travel, Block Bash = city) are physically LARGER
  with a deeper frame and show **rich scenes**, not just a lone figure.

## Screen palette
- Pale grey-green STN LCD, near-black "on" pixels. Confirmed (matches our current palette).

## Animations
1. **Power-on / boot** (when a cube turns on): the LCD fills with a growing
   **maze / circuit "wipe-on" pattern** (small cubes). Jumbo cubes **draw their scene
   in** (e.g. palm tree draws, sky is night with a moon then transitions toward day).
   Then it settles to reveal the idle character. ~1.5–2.5 s. Distinctive & signature.
2. **Idle**: a single black stick figure standing, doing small **choppy** moves
   (~2–4 fps LCD cadence): shift weight, look, occasional walk, occasional signature
   game move. (We already trace these from the real sprite sheet.)
3. **Signature game** (per character, tied to the button icon): kept as our "tricks".
4. **Sleep / idle-timeout**: the figure **disappears and the screen goes fully BLANK**
   — just the plain pale LCD, no figure, no "Zzz", no dark inversion.
   (Correction: our old dark+Zzz sleep was wrong.)
5. **Jumbo scenes**: travel = beach with a **palm tree** + **moon/sun** in the sky
   (day/night), figure walks the shore; city = **building skyline + ladders**, figure
   navigates. Rendered as static LCD scene art behind the figure.

## Implementation deltas vs. current emulator
- Redesign `drawCube`: recessed screen well, control deck with molded game-icon + 3
  grey buttons, remove front nubs, jumbo styling.
- Add a per-cube **boot** state + maze wipe-on animation on spawn / power-on.
- Change **sleep** to a blank pale screen (figure hidden).
- Give jumbo characters a **scene** background (palm+moon / city skyline).
- Map each character to a **game-icon** for the deck.
