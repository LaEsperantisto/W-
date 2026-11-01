# W — Beyond the Third Axis

A small first-person browser game about exploring a 3D world while moving along a fourth spatial coordinate, `w`.

The title screen offers three modes:

- **Levels** — the twelve hand-built puzzle rooms, completed in order or picked from the list.
- **Story — The Long Way Home** — a six-chapter campaign with interludes and an epilogue. Your place in the campaign is saved, so returning to Story mode resumes where you left off.
- **Open World** — a seeded, procedurally generated voxel world you can mine and build in. The terrain is genuinely four-dimensional: as you move along `w` the landscape folds into different worlds. Within ±4 of the origin there are nine whole slices of ground, each with its own hills, lakes and trees, and far slices can simply have no ground at all — the void where another world's floor should be. Everything you dig or place is stored per seed (and per slice), so the same seed gives you the same world, kept the way you left it. Find the fourteen artifacts (some hide in other W slices), watch out for wraiths that phase through W, sleep in the cabin bed to move your spawn, and fall out of the world and you wake up there. Type any seed to get a different world.

The pause menu (Esc) also has an **Options** button, reachable from the title screen too.

## Run it

The game loads level JSON files with `fetch()`, so it must be served over HTTP rather than opened directly as `file://`.

With Python 3 installed, open a terminal in this folder and run:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

You need an internet connection because Three.js is loaded from jsDelivr.

## Controls

- `W`, `A`, `S`, `D`: move
- Mouse: look around (click the game to capture the mouse)
- `Space`: jump
- `+` / `=` or `E` or scroll the mouse wheel up: increase your W coordinate
- `-` or `Q` or scroll the mouse wheel down: decrease your W coordinate
- `Shift`: move faster
- `Esc`: pause / release the mouse
- `R`: reset player

The `+` and `-` keys move in steps of 0.25 W units. The world currently limits you to `-8 <= w <= 8`.

### Open World controls

All of the above, plus:

- **Left mouse button** (hold): mine the block at the crosshair
- **Right mouse button**: place a block from your inventory
- `1`–`5`: pick dirt, stone, wood, leaves or sand for placing
- `F`: sleep in the cabin bed to set your spawn
- `R`: respawn at your bed/spawn
- The perception overlay marks nearby wraiths and artifacts; artifacts you can currently see glow at their height along W.

In the open world your `W` is clamped to ±4, giving nine discrete ground slices. The slice you stand on is fully solid; the nearest neighbouring slice shows through as translucent ghost terrain you can see but not touch, mine, or stand on. Mining and placing always act on the slice you currently occupy, and each change is remembered with its `w`, so a hole dug at `w = 2` doesn't leak into the slice at `w = 0`.

## Options

- **Look sensitivity** and **Invert Y**
- **Field of view** (60–110)
- **Perception overlay** on/off, and a **drift** slider (0 disables marker drift)
- **Shadow quality**: off / low / high
- **W step**: 0.25 or 0.5 per keypress

Options are saved in the browser and apply live.

## How the fourth dimension works here

Every level object is a 3D box with an additional `w` coordinate and a `w_size` (its thickness along W). The game displays an object when the player's W coordinate intersects that object's W interval:

```text
abs(player.w - object.w) < object.w_size / 2
```

Objects outside the current slice disappear. Objects fade as you approach the edge of their W interval. Collision is only enabled for visible solid objects. When the player respawns — after a wraith kill or `R` — everything is re-evaluated against the new W coordinate, so the slice you wake up in is instantly the one you see.

This is a deliberately simple model: the player is a 3D viewpoint moving through slices of a 4D arrangement. It is not a physically complete simulation of a four-dimensional organism.

## Making a new level

All level data lives in the `levels/` folder. You do not need to edit JavaScript to make a normal level.

### 1. Create a JSON file

For example, create `levels/04_my_level.json`:

```json
{
  "name": "My Level",
  "description": "A short description shown in level select.",
  "completion": "A message shown when the player reaches the exit.",
  "spawn": [0, 1.7, 5, 0],
  "boxes": [
    {
      "pos": [0, -0.5, 0],
      "size": [12, 1, 12],
      "w": 0,
      "w_size": 1.2,
      "colour": 7895160
    }
  ],
  "goal": {
    "pos": [0, 1, -4],
    "size": [1.2, 2, 0.4],
    "w": 2,
    "w_size": 1.2,
    "colour": 9224144,
    "solid": false
  }
}
```

### 2. Add it to the manifest

Open `levels/manifest.json` and add your file to the `levels` array:

```json
{
  "levels": [
    { "file": "01_first_slice.json" },
    { "file": "02_the_offset.json" },
    { "file": "03_the_fold.json" },
    { "file": "04_my_level.json" }
  ]
}
```

The order in this list is the order shown in the game and the order used by the Next Level button.

### Level fields

| Field | Meaning |
|---|---|
| `name` | Level title |
| `description` | Short level-select description |
| `completion` | Optional completion message |
| `spawn` | `[x, y, z, w]` starting position (the Y value is the player's feet height); `w` may be omitted |
| `boxes` | Array of ordinary 3D boxes |
| `goal` | Exit box the player must reach |
| `pos` | Box centre `[x, y, z]` |
| `size` | Box dimensions `[width, height, depth]` |
| `w` | Centre of the box along the fourth axis (default `0`) |
| `w_size` | Thickness along W (default `1.2`) |
| `colour` | Optional decimal RGB hex colour, e.g. `9224144` |
| `solid` | Set `false` for a non-solid object |

`pos` and `size` may also carry the fourth component directly: `pos: [x, y, z, w]` and `size: [sx, sy, sz, sw]`. The `w` / `w_size` fields above are the older form and are still supported.

A box at `w: 0` with `w_size: 1` occupies the interval from `w = -0.5` to `w = 0.5`. Put another platform at `w: 2` to make the player shift dimensions to reach it.

### Design tips

- Always give the player a safe floor at the spawn W coordinate.
- Make sure the exit's W interval overlaps a reachable W coordinate.
- A level can have several routes occupying different W slices.
- Keep the spawn just above the floor (`y: 0.05` works for a floor whose top is at `y: 0`).
- Colours are optional; use `0xRRGGBB` converted to decimal, or a decimal RGB value directly.

## Project structure

```text
4d_game/
├── index.html
├── style.css
├── js/
│   ├── engine.js        core 4D slice engine (rendering, physics, W slicing)
│   ├── main.js          screens, menus, mode switching, input glue
│   ├── options.js       persistent settings + options screen binding
│   └── world.js         procedural open world (terrain, mining, artifacts, wraiths)
├── levels/
│   ├── manifest.json
│   ├── 01.json … 12.json
├── story/
│   ├── chapters.json    campaign chapter list
│   └── ch01.json … ch06.json
├── prose/
│   ├── story.json       interlude/epilogue text for the campaign
│   ├── artifacts.json   artifact blurbs
│   └── landmarks.json   landmark arrival blurbs
└── README.md
```

## Notes

This is a prototype. It uses Three.js for rendering and basic axis-aligned box collision. The level format is intentionally plain JSON so that levels can be made by hand or generated by another tool.
