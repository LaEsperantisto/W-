// Open World mode: a seeded procedural 4D voxel world.
// Terrain, water, trees, landmarks, a cabin with a bed (respawn),
// mining/placing, artifacts hidden in off-W slices, and W-phasing wraiths.

import * as engine from './engine.js';
import { THREE } from './engine.js';

const {
  scene, camera, player,
  loadWorld, clearWorld, setCollider, setFrameHandler,
  disposeMesh, respawnTo, getRunning, PLAYER_RADIUS, PLAYER_HEIGHT
} = engine;

// ------------------------------------------------------------
// Block types
// ------------------------------------------------------------

const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4,
      WOOD = 5, LEAVES = 6, WATER = 7, PLANK = 8, BED = 9;

const BLOCK_COLOR = {
  [GRASS]: 0x5f8f4a,
  [DIRT]: 0x7a5b3a,
  [STONE]: 0x8b8d90,
  [SAND]: 0xc9b87a,
  [WOOD]: 0x6b4f2f,
  [LEAVES]: 0x3f6b34,
  [WATER]: 0x3d6f9e,
  [PLANK]: 0x9c7a4f,
  [BED]: 0xb04a4a
};

const BLOCK_NAME = {
  [GRASS]: 'grass', [DIRT]: 'dirt', [STONE]: 'stone', [SAND]: 'sand',
  [WOOD]: 'wood', [LEAVES]: 'leaves', [PLANK]: 'plank'
};

const HARDNESS = {
  [GRASS]: 0.4, [DIRT]: 0.4, [SAND]: 0.35, [LEAVES]: 0.15,
  [WOOD]: 0.9, [PLANK]: 0.7, [STONE]: 1.5
};

const DROPS = {
  [GRASS]: DIRT, [DIRT]: DIRT, [SAND]: SAND, [STONE]: STONE,
  [WOOD]: WOOD, [PLANK]: WOOD, [LEAVES]: LEAVES
};

const WORLD_HALF = 64;   // x, z in [-64, 64)
const WORLD_H = 40;      // y in [0, 40)
const W_SLICES = 9;      // discrete W cells, w = wi - W_HOME, w in [-4, 4]
const W_HOME = 4;        // slice index holding w = 0 (cabin slice)
const CHUNK = 16;
const CHUNKS = (WORLD_HALF * 2) / CHUNK; // 8 x 8
const WATER_LEVEL = 3;

// ------------------------------------------------------------
// Seeded randomness
// ------------------------------------------------------------

function xmur3(str) {
  let h = 1779033703 ^ str.length;

  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz, seed) {
  let h = ix * 374761393 + iz * 668265263 + seed * 144665;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);

  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);

  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function fbm(x, z, seed) {
  return (
    valueNoise(x, z, seed) * 0.55 +
    valueNoise(x * 2.1, z * 2.1, seed + 7) * 0.3 +
    valueNoise(x * 4.3, z * 4.3, seed + 13) * 0.15
  );
}

// ------------------------------------------------------------
// Landmarks (deterministic positions per seed)
// ------------------------------------------------------------

const LANDMARKS = [
  { key: 'ruin',   x: 18,  z: -22 },
  { key: 'obelisk', x: -14, z: 30 },
  { key: 'arch',   x: -44, z: 6 },
  { key: 'hilltop', x: 40, z: -40, r: 12 },
  { key: 'lake',   x: 28,  z: 26, r: 13 },
  { key: 'flats',  x: -35, z: -20, r: 11 }
];

// ------------------------------------------------------------
// World data
// ------------------------------------------------------------

let active = false;
let seedStr = '';
let seedNum = 0;

let data = null;          // Uint8Array for the whole world
let changed = new Map();  // "x,y,z" -> type after edits (0 = mined)
let dirtyChunks = new Set();

const chunkGroups = [];   // THREE.Group per chunk
let blockMaterials = null;

const SZ = WORLD_HALF * 2;

// A block is a 4D cell: (x, y, z) at slice wi (w value wi - W_HOME).
function idx(x, y, z, wi) {
  return wi * SZ * SZ * WORLD_H + ((x + WORLD_HALF) * SZ + (z + WORLD_HALF)) * WORLD_H + y;
}

function wiAt(w) {
  return Math.max(0, Math.min(W_SLICES - 1, Math.round(w) + W_HOME));
}

function chunkOf(x, z) {
  return [
    Math.floor((x + WORLD_HALF) / CHUNK),
    Math.floor((z + WORLD_HALF) / CHUNK)
  ];
}

function inWorld(x, y, z) {
  return x >= -WORLD_HALF && x < WORLD_HALF &&
         z >= -WORLD_HALF && z < WORLD_HALF &&
         y >= 0 && y < WORLD_H;
}

function get(x, y, z, wi) {
  if (y < 0) return STONE;
  if (wi < 0 || wi >= W_SLICES) return AIR;
  if (!inWorld(x, y, z)) return AIR;

  return data[idx(x, y, z, wi)];
}

function set(x, y, z, wi, type) {
  if (!inWorld(x, y, z) || y === 0 || wi < 0 || wi >= W_SLICES) return;

  data[idx(x, y, z, wi)] = type;
  changed.set(`${x},${y},${z},${wi}`, type);

  const [cx, cz] = chunkOf(x, z);

  const mark = (ax, az, aw) => {
    if (ax >= 0 && az >= 0 && ax < CHUNKS && az < CHUNKS && aw >= 0 && aw < W_SLICES) {
      dirtyChunks.add(ax + ',' + az + ',' + aw);
    }
  };

  mark(cx, cz, wi);

  // Faces on the chunk border and on the W borders also change.
  if ((x + WORLD_HALF) % CHUNK === 0) mark(cx - 1, cz, wi);
  if ((x + WORLD_HALF) % CHUNK === CHUNK - 1) mark(cx + 1, cz, wi);
  if ((z + WORLD_HALF) % CHUNK === 0) mark(cx, cz - 1, wi);
  if ((z + WORLD_HALF) % CHUNK === CHUNK - 1) mark(cx, cz + 1, wi);
}

function isSolid(type) {
  return type !== AIR && type !== WATER;
}

function heightAt(x, z, wi = W_HOME) {
  for (let y = WORLD_H - 1; y >= 0; y--) {
    const t = get(x, y, z, wi);
    if (isSolid(t)) return y;
  }

  return 0;
}

// ------------------------------------------------------------
// Terrain generation
// ------------------------------------------------------------

function terrainHeight(x, z) {
  let h = 3 + fbm(x * 0.035, z * 0.035, seedNum) * 9;

  // Hill under the hilltop landmark.
  const hd = Math.hypot(x - 40, z + 40);
  if (hd < 20) h += (1 - hd / 20) * 8;

  // Lake basin.
  const ld = Math.hypot(x - 28, z - 26);
  if (ld < 16) h = Math.min(h, 2 - (1 - ld / 16) * 3);

  // Flat mineral plain.
  const fd = Math.hypot(x + 35, z + 20);
  if (fd < 13) h = h * (1 - Math.min(1, fd / 13)) + 5 * Math.min(1, fd / 13);

  // Keep the cabin clearing flat.
  const cd = Math.hypot(x, z);
  if (cd < 10) h = h * (cd / 10) + Math.round(fbm(0, 0, seedNum) * 9 + 3) * (1 - cd / 10);

  return Math.max(1, Math.min(WORLD_H - 8, Math.round(h)));
}

// The home slice (w = 0) holds the ridge as terrainHeight shapes it.
// Farther slices drift, fold, and tear open: the same (x, z) column
// is a different column of blocks in a different W.
function terrainHeightW(x, z, wi) {
  const base = terrainHeight(x, z);
  const w = wi - W_HOME;

  if (w === 0) return base;

  // The clearing around the cabin exists in every slice, unchanged.
  if (Math.hypot(x, z) < 9) return base;

  // Distant slices tear open into voids.
  if (Math.abs(w) >= 2 &&
      fbm(x * 0.02 + w * 7.3, z * 0.02 - w * 4.1, seedNum + wi * 91) < 0.16) {
    return -1;
  }

  const amp = Math.min(6, Math.abs(w) * 1.6);

  const drift = (fbm(x * 0.045 + w * 17.1, z * 0.045 - w * 9.7, seedNum + 200 + wi * 37) - 0.5) * 2 * amp;

  return Math.max(0, Math.min(WORLD_H - 10, Math.round(base + drift)));
}

function generateTerrain() {
  for (let wi = 0; wi < W_SLICES; wi++) {
    for (let x = -WORLD_HALF; x < WORLD_HALF; x++) {
      for (let z = -WORLD_HALF; z < WORLD_HALF; z++) {
        const h = terrainHeightW(x, z, wi);

        if (h < 0) continue;

        const onFlats = Math.hypot(x + 35, z + 20) < 12;
        const nearLake = Math.hypot(x - 28, z - 26) < 17;

        for (let y = 0; y <= h; y++) {
          let t;

          if (y === 0) t = STONE;
          else if (y === h) t = (onFlats || (nearLake && h <= WATER_LEVEL + 1)) ? SAND : GRASS;
          else if (y >= h - 3) t = DIRT;
          else t = STONE;

          // Stone outcrops poke through the soil (per-slice pattern).
          if (y === h && !onFlats && fbm(x * 0.11 + 40, z * 0.11 - 30, seedNum + 31 + wi * 13) > 0.72) {
            t = STONE;

            if (hash2(x, z, seedNum + 5 + wi * 13) > 0.7) {
              data[idx(x, y + 1, z, wi)] = STONE;
            }
          }

          data[idx(x, y, z, wi)] = t;
        }

        for (let y = h + 1; y <= WATER_LEVEL; y++) {
          data[idx(x, y, z, wi)] = WATER;
        }
      }
    }
  }
}

function generateTrees(rand, wi) {
  for (let x = -WORLD_HALF + 3; x < WORLD_HALF - 3; x++) {
    for (let z = -WORLD_HALF + 3; z < WORLD_HALF - 3; z++) {
      if (Math.hypot(x, z) < 11) continue;
      if (get(x, heightAt(x, z, wi), z, wi) !== GRASS) continue;
      if (hash2(x, z, seedNum + 71 + wi * 29) > 0.018) continue;

      const base = heightAt(x, z, wi) + 1;
      const trunk = 3 + Math.floor(hash2(x, z, seedNum + 73 + wi * 29) * 3);

      if (base + trunk + 2 >= WORLD_H) continue;

      for (let y = 0; y < trunk; y++) {
        data[idx(x, base + y, z, wi)] = WOOD;
      }

      const top = base + trunk;

      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = -1; dy <= 1; dy++) {
            const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 1.5;

            if (d > 3) continue;

            const x2 = x + dx, y2 = top + dy, z2 = z + dz;

            if (!inWorld(x2, y2, z2)) continue;
            if (data[idx(x2, y2, z2, wi)] !== AIR) continue;

            data[idx(x2, y2, z2, wi)] = LEAVES;
          }
        }
      }
    }
  }
}

function placeStructure(x0, z0, cells, type, wi = W_HOME) {
  for (const [dx, dy, dz] of cells) {
    const x = x0 + dx, y = heightAt(x0 + dx, z0 + dz, wi) + 1 + dy, z = z0 + dz;

    if (inWorld(x, y, z)) {
      data[idx(x, y, z, wi)] = type;
    }
  }
}

function generateLandmarks() {
  // The Overgrown Ruin: breached stone walls.
  const ruin = [];

  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const edge = Math.abs(dx) === 4 || Math.abs(dz) === 3;

      if (!edge) continue;
      if (hash2(dx * 7 + 3, dz * 13 - 2, seedNum + 91) > 0.55) continue; // breaches

      for (let dy = 0; dy < 2 + (hash2(dx, dz, seedNum + 93) > 0.6 ? 1 : 0); dy++) {
        ruin.push([dx, dy, dz]);
      }
    }
  }

  placeStructure(18, -22, ruin, STONE);

  // The Lonely Obelisk.
  const obelisk = [];

  for (let dx = 0; dx <= 1; dx++) {
    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy < 9; dy++) {
        obelisk.push([dx, dy, dz]);
      }
    }
  }

  placeStructure(-14, 30, obelisk, STONE);

  // The Broken Arch.
  const arch = [];

  for (let dy = 0; dy < 4; dy++) {
    arch.push([0, dy, 0]);
    arch.push([4, dy, 0]);
  }

  for (let dx = 0; dx <= 4; dx++) {
    arch.push([dx, 4, 0]);
  }

  placeStructure(-44, 6, arch, STONE);
}

function generateCabin() {
  // Flatten the clearing first (terrainHeight already blends; level exactly).
  const floorY = terrainHeight(0, 0);

  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      const h = terrainHeight(x, z);

      for (let y = h + 1; y <= floorY; y++) data[idx(x, y, z, W_HOME)] = DIRT;
      for (let y = floorY + 1; y <= h; y++) data[idx(x, y, z, W_HOME)] = AIR;
      if (get(x, floorY, z, W_HOME) === GRASS) data[idx(x, floorY, z, W_HOME)] = GRASS;
    }
  }

  const walls = [];
  const y0 = floorY + 1;

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;

      if (!edge) continue;
      if (dx === 0 && dz === 2) continue;      // doorway

      for (let dy = 0; dy < 3; dy++) walls.push([dx, y0 + dy, dz]);
    }
  }

  // Roof.
  const roof = [];

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) roof.push([dx, y0 + 3, dz]);
  }

  placeStructure(0, 0, walls.concat(roof).map(([dx, y, dz]) => [dx, y - floorY - 1, dz]), PLANK);

  // Bed in the back corner.
  data[idx(-1, floorY + 1, -1, W_HOME)] = BED;

  return floorY;
}

// ------------------------------------------------------------
// Chunk meshing
// ------------------------------------------------------------

const FACES = [
  // [dx, dy, dz, corner offsets...]
  { n: [1, 0, 0],  v: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { n: [-1, 0, 0], v: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { n: [0, 1, 0],  v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { n: [0, -1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { n: [0, 0, 1],  v: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
  { n: [0, 0, -1], v: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }
];

function buildBlockMaterials() {
  if (blockMaterials) return blockMaterials;

  blockMaterials = [];

  for (let wi = 0; wi < W_SLICES; wi++) {
    const set = {};

    // Neighbouring slices carry a slight hue lift so phase shifts
    // read even without the HUD.
    const scale = 1 + ((wi - W_HOME) / W_HOME) * 0.06;

    for (const t of [GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANK, BED]) {
      set[t] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(BLOCK_COLOR[t]).multiplyScalar(scale),
        roughness: 0.9,
        metalness: 0.03,
        vertexColors: true
      });
    }

    set[WATER] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(BLOCK_COLOR[WATER]).multiplyScalar(scale),
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });

    blockMaterials.push(set);
  }

  return blockMaterials;
}

function faceShade(x, y, z, face) {
  const jitter = 0.86 + hash2(x * 3 + y, z * 5 - y, seedNum + 997) * 0.18;
  const lambert = face.n[1] === 1 ? 1 : face.n[1] === -1 ? 0.62 : 0.82;

  return jitter * lambert;
}

function gi(cx, cz, wi) {
  return (cx * CHUNKS + cz) * W_SLICES + wi;
}

function buildChunk(cx, cz, wi) {
  const old = chunkGroups[gi(cx, cz, wi)];

  if (old) {
    scene.remove(old);

    old.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  const group = new THREE.Group();
  const buckets = {};

  const pushFace = (type, x, y, z, face) => {
    const b = (buckets[type] ??= { pos: [], norm: [], color: [], ind: [] });

    const base = b.pos.length / 3;

    for (const [ox, oy, oz] of face.v) {
      b.pos.push(x + ox, y + oy, z + oz);
      b.norm.push(face.n[0], face.n[1], face.n[2]);
    }

    const shade = faceShade(x, y, z, face);

    for (let i = 0; i < 4; i++) {
      b.color.push(shade, shade, shade);
    }

    b.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const x0 = cx * CHUNK - WORLD_HALF;
  const z0 = cz * CHUNK - WORLD_HALF;

  for (let x = x0; x < x0 + CHUNK; x++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      for (let y = 0; y < WORLD_H; y++) {
        const t = get(x, y, z, wi);

        if (t === AIR) continue;

        for (const f of FACES) {
          const nb = get(x + f.n[0], y + f.n[1], z + f.n[2], wi);

          // Water hides faces against other water; solid faces
          // against water are kept so the lakebed reads clearly.
          if (nb === AIR) { pushFace(t, x, y, z, f); }
          else if (nb === WATER && t !== WATER) { pushFace(t, x, y, z, f); }
        }
      }
    }
  }

  for (const [typeStr, b] of Object.entries(buckets)) {
    const geo = new THREE.BufferGeometry();

    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.color, 3));
    geo.setIndex(b.ind);

    const mesh = new THREE.Mesh(geo, buildBlockMaterials()[wi][Number(typeStr)]);

    mesh.castShadow = Number(typeStr) !== WATER;
    mesh.receiveShadow = true;
    mesh.userData.voxelChunk = true;
    mesh.userData.voxelW = wi;
    mesh.userData.voxelType = Number(typeStr);

    if (Number(typeStr) === WATER) {
      mesh.renderOrder = 1;
    }

    group.add(mesh);
  }

  chunkGroups[gi(cx, cz, wi)] = group;
  scene.add(group);
}

function rebuildDirtyChunks() {
  let budget = 3;

  for (const key of dirtyChunks) {
    if (budget <= 0) break;

    const [cx, cz, wi] = key.split(',').map(Number);

    dirtyChunks.delete(key);

    if (cx < 0 || cz < 0 || cx >= CHUNKS || cz >= CHUNKS || wi < 0 || wi >= W_SLICES) continue;

    buildChunk(cx, cz, wi);
    budget--;
  }
}

// Only the slice the player stands in renders solid; adjacent
// slices hang around as ghost overlays so W-phasing is visible.
const WATER_OPACITY = 0.55;
let sliceMode = null;

function updateSliceVisibility() {
  const materials = buildBlockMaterials();
  const d = [];
  let nearest = W_HOME;
  let best = Infinity;

  for (let wi = 0; wi < W_SLICES; wi++) {
    d.push(Math.abs(player.w - (wi - W_HOME)));

    // On an exact tie prefer the higher slice, matching wiAt().
    if (d[wi] <= best) { best = d[wi]; nearest = wi; }
  }

  const mode = [];

  for (let wi = 0; wi < W_SLICES; wi++) {
    mode.push(wi === nearest ? 'solid' : d[wi] <= 0.75 ? 'ghost' : 'off');
  }

  if (sliceMode && sliceMode.join() === mode.join()) return;

  sliceMode = mode;

  for (let wi = 0; wi < W_SLICES; wi++) {
    const m = mode[wi];
    const opacity = m === 'ghost' ? 0.3 : null;

    for (let cx = 0; cx < CHUNKS; cx++) {
      for (let cz = 0; cz < CHUNKS; cz++) {
        const g = chunkGroups[gi(cx, cz, wi)];

        if (!g) continue;

        g.visible = m !== 'off';

        if (m === 'off') continue;

        for (const mesh of g.children) {
          const mat = mesh.material;
          const isWater = mat === materials[wi][WATER];

          if (opacity === null) {
            if (isWater) {
              mat.opacity = WATER_OPACITY;
              mat.depthWrite = false;
            } else {
              mat.opacity = 1;
              mat.transparent = false;
              mat.depthWrite = true;
            }
          } else {
            mat.transparent = true;
            mat.opacity = isWater ? 0.2 : opacity;
            mat.depthWrite = false;
          }

          mesh.castShadow = m === 'solid' && !isWater;
        }
      }
    }
  }
}

function disposeChunks() {
  for (const g of chunkGroups) {
    if (!g) continue;

    scene.remove(g);

    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  chunkGroups.length = 0;
}

// ------------------------------------------------------------
// Voxel collision
// ------------------------------------------------------------

function voxelCollides(x, y, z) {
  const wi = wiAt(player.w);

  const minX = Math.floor(x - PLAYER_RADIUS);
  const maxX = Math.floor(x + PLAYER_RADIUS);
  const minY = Math.floor(y);
  const maxY = Math.floor(y + PLAYER_HEIGHT - 0.001);
  const minZ = Math.floor(z - PLAYER_RADIUS);
  const maxZ = Math.floor(z + PLAYER_RADIUS);

  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        // World edges are invisible walls; y<0 handled by get().
        if (bx < -WORLD_HALF || bx >= WORLD_HALF ||
            bz < -WORLD_HALF || bz >= WORLD_HALF) {
          return true;
        }

        if (isSolid(get(bx, by, bz, wi))) return true;
      }
    }
  }

  return false;
}

// ------------------------------------------------------------
// Persistence
// ------------------------------------------------------------

let saveTimer = null;
let savedArtifacts = [];

function storageKey() {
  return 'w_openworld_' + seedStr;
}

function saveWorld() {
  const payload = {
    v: 2,
    changes: [...changed.entries()].map(([k, t]) => {
      const [x, y, z, wi] = k.split(',').map(Number);
      return [x, y, z, wi, t];
    }),
    artifacts: artifactState.map(a => (a.collected ? a.id : -1)).filter(v => v >= 0),
    respawn: [customSpawn[0], customSpawn[1], customSpawn[2], customSpawn[3]]
  };

  try {
    localStorage.setItem(storageKey(), JSON.stringify(payload));
  } catch {
    // Storage full or unavailable: keep playing unsaved.
  }
}

function queueSave() {
  if (saveTimer !== null) return;

  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveWorld();
  }, 600);
}

function loadSavedChanges() {
  let saved = null;

  try {
    saved = JSON.parse(localStorage.getItem(storageKey()) || 'null');
  } catch {
    saved = null;
  }

  if (!saved) {
    savedArtifacts = [];
    return;
  }

  for (const entry of saved.changes ?? []) {
    // v2 entries are [x, y, z, wi, type]; legacy v1 entries are
    // [x, y, z, type] and belonged to the home slice.
    const [x, y, z, a, b] = entry;
    const wi = saved.v === 2 ? a : W_HOME;
    const t = saved.v === 2 ? b : a;

    if (inWorld(x, y, z) && y !== 0 && wi >= 0 && wi < W_SLICES) {
      data[idx(x, y, z, wi)] = t;
      changed.set(`${x},${y},${z},${wi}`, t);
    }
  }

  if (saved.respawn && saved.respawn.length >= 4) {
    customSpawn = saved.respawn;
  }

  const collected = new Set(saved.artifacts ?? []);

  savedArtifacts = saved.artifacts ?? [];

  for (const a of artifactState) {
    a.collected = collected.has(a.id);
  }
}

// ------------------------------------------------------------
// HUD (created once)
// ------------------------------------------------------------

let hudEl = null, hpFill = null, artifactLabel = null;
let hotbarEl = null, hintEl = null, toastEl = null, mineBar = null;

let toastTimer = 0;
let hintText = '';
let hintTimer = 0;

function worldToast(message) {
  if (!toastEl) return;

  toastEl.textContent = message;
  toastTimer = 4.5;
}

function showHint(message, seconds = 7) {
  hintText = message;
  hintTimer = seconds;

  if (hintEl) {
    hintEl.textContent = message;
  }
}

function createWorldHUD() {
  if (hudEl) return;

  const style = document.createElement('style');

  style.textContent = `
    #world-hud { position:fixed; left:0; right:0; bottom:0; z-index:900; pointer-events:none; font-family:'DM Mono',monospace; }
    #world-hint { position:fixed; left:50%; bottom:22%; transform:translateX(-50%); max-width:640px; text-align:center; color:#cfe8dd; font-size:12px; letter-spacing:.08em; text-shadow:0 2px 10px #000; }
    #world-toast { position:fixed; left:50%; bottom:15%; transform:translateX(-50%); max-width:680px; text-align:center; color:#8cf0d0; font-size:11px; letter-spacing:.1em; text-shadow:0 2px 10px #000; }
    #hp-bar { position:fixed; left:24px; bottom:24px; width:180px; height:10px; border:1px solid rgba(210,230,240,.35); }
    #hp-fill { height:100%; width:100%; background:#8cf0d0; transition:width .2s; }
    #artifacts-count { position:fixed; left:24px; bottom:44px; color:#8cf0d0; font-size:10px; letter-spacing:.12em; }
    #hotbar { position:fixed; left:50%; bottom:16px; transform:translateX(-50%); display:flex; gap:6px; }
    #hotbar .slot { width:46px; height:46px; border:1px solid rgba(210,230,240,.3); position:relative; }
    #hotbar .slot.sel { border-color:#8cf0d0; box-shadow:0 0 8px rgba(140,240,208,.4); }
    #hotbar .slot i { position:absolute; inset:6px; display:block; }
    #hotbar .slot b { position:absolute; right:2px; bottom:1px; font-size:9px; color:#e9edf2; font-weight:400; }
    #hotbar .slot u { position:absolute; left:3px; top:1px; font-size:8px; color:#9aa7b6; text-decoration:none; }
    #mine-bar { position:fixed; left:50%; top:52%; width:44px; height:4px; transform:translateX(-50%); border:1px solid rgba(255,255,255,.25); }
    #mine-bar i { display:block; height:100%; width:0; background:#8cf0d0; }
  `;

  document.head.appendChild(style);

  hudEl = document.createElement('div');
  hudEl.id = 'world-hud';
  hudEl.classList.add('hidden');

  hudEl.innerHTML = `
    <div id="hp-bar"><div id="hp-fill"></div></div>
    <div id="artifacts-count">ARTIFACTS 0/14</div>
    <div id="hotbar"></div>
    <div id="world-hint"></div>
    <div id="world-toast"></div>
    <div id="mine-bar"><i></i></div>
  `;

  document.body.appendChild(hudEl);

  hpFill = document.getElementById('hp-fill');
  artifactLabel = document.getElementById('artifacts-count');
  hotbarEl = document.getElementById('hotbar');
  hintEl = document.getElementById('world-hint');
  toastEl = document.getElementById('world-toast');
  mineBar = hudEl.querySelector('#mine-bar i');
}

// ------------------------------------------------------------
// Inventory + hotbar
// ------------------------------------------------------------

const HOTBAR_TYPES = [DIRT, STONE, WOOD, LEAVES, SAND];

let inventory = {};
let selected = 0;

function renderHotbar() {
  if (!hotbarEl) return;

  hotbarEl.innerHTML = '';

  HOTBAR_TYPES.forEach((t, i) => {
    const slot = document.createElement('div');

    slot.className = 'slot' + (i === selected ? ' sel' : '');
    slot.innerHTML = `<u>${i + 1}</u><i style="background:#${BLOCK_COLOR[t].toString(16).padStart(6, '0')}"></i><b>${inventory[t] || 0}</b>`;

    hotbarEl.append(slot);
  });
}

// ------------------------------------------------------------
// Mining + placing
// ------------------------------------------------------------

const raycaster = new THREE.Raycaster();

let mining = null;       // {x,y,z,progress}
let mineHeld = false;
let placeQueued = false;

function rayVoxel() {
  raycaster.far = 5.5;
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);

  const meshes = [];

  for (const g of chunkGroups) {
    if (g) meshes.push(...g.children);
  }

  // Raycasting ignores visibility, so filter to the slice we stand
  // in: ghost and far slices stay out of reach.
  const wantWi = wiAt(player.w);
  const hits = raycaster.intersectObjects(meshes, false)
    .filter(h => h.object.userData.voxelW === wantWi);

  if (!hits.length) return null;

  const hit = hits[0];
  const n = hit.face.normal;
  const p = hit.point;
  const wi = wantWi;

  // The voxel actually hit, and the empty cell in front of its face
  // (the placement target). Both live in the hit block's W slice.
  const sx = Math.floor(p.x - n.x * 0.5);
  const sy = Math.floor(p.y - n.y * 0.5);
  const sz = Math.floor(p.z - n.z * 0.5);

  const ax = Math.floor(p.x + n.x * 0.5);
  const ay = Math.floor(p.y + n.y * 0.5);
  const az = Math.floor(p.z + n.z * 0.5);

  return { x: ax, y: ay, z: az, wi, solid: { x: sx, y: sy, z: sz, wi } };
}

function tryMine(dt) {
  const bar = mineBar;

  if (!mineHeld) {
    mining = null;
    if (bar) bar.style.width = '0';
    return;
  }

  const target = rayVoxel();
  const v = target && target.solid;

  if (!v || !isSolid(get(v.x, v.y, v.z, v.wi)) ||
      v.y === 0 || get(v.x, v.y, v.z, v.wi) === BED) {
    mining = null;
    if (bar) bar.style.width = '0';
    return;
  }

  if (!mining || mining.x !== v.x || mining.y !== v.y || mining.z !== v.z || mining.wi !== v.wi) {
    mining = { x: v.x, y: v.y, z: v.z, wi: v.wi, progress: 0 };
  }

  const t = get(mining.x, mining.y, mining.z, mining.wi);

  mining.progress += dt / (HARDNESS[t] ?? 1);

  if (bar) bar.style.width = `${Math.min(100, mining.progress * 100)}%`;

  if (mining.progress >= 1) {
    const drop = DROPS[t];

    set(mining.x, mining.y, mining.z, mining.wi, AIR);

    if (drop !== undefined) {
      inventory[drop] = (inventory[drop] || 0) + 1;
      renderHotbar();
    }

    mining = null;
    if (bar) bar.style.width = '0';
    queueSave();
  }
}

function overlapsPlayer(x, y, z, wi) {
  if (Math.abs(player.w - (wi - W_HOME)) >= 0.6) return false;

  return (
    x + 1 > player.x - PLAYER_RADIUS &&
    x < player.x + PLAYER_RADIUS &&
    y + 1 > player.y &&
    y < player.y + PLAYER_HEIGHT &&
    z + 1 > player.z - PLAYER_RADIUS &&
    z < player.z + PLAYER_RADIUS
  );
}

function tryPlace() {
  if (!placeQueued) return;

  placeQueued = false;

  const target = rayVoxel();

  if (!target) return;

  const t = get(target.x, target.y, target.z, target.wi);

  if (t !== AIR && t !== WATER) return;
  if (overlapsPlayer(target.x, target.y, target.z, target.wi)) return;

  const type = HOTBAR_TYPES[selected];

  if ((inventory[type] || 0) <= 0) return;

  set(target.x, target.y, target.z, target.wi, type);

  inventory[type]--;
  renderHotbar();
  queueSave();
}

// ------------------------------------------------------------
// Wraiths
// ------------------------------------------------------------

let wraiths = [];
let playerHP = 100;
let lastHitAt = 0;
let worldClock = 0;
let lastSafeW = null;

function wraithMesh() {
  const geo = new THREE.BoxGeometry(0.8, 1.7, 0.8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x141824,
    roughness: 0.5,
    transparent: true,
    opacity: 0.85,
    emissive: 0x2a3f66,
    emissiveIntensity: 0.6
  });

  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x6f86b8, transparent: true, opacity: 0.9 })
  );

  mesh.add(edges);

  return mesh;
}

function spawnWraith(rand) {
  const ang = rand() * Math.PI * 2;
  const dist = 28 + rand() * 30;
  const x = Math.cos(ang) * dist;
  const z = Math.sin(ang) * dist;

  if (Math.abs(x) >= WORLD_HALF - 3 || Math.abs(z) >= WORLD_HALF - 3) return;

  const w = -3 + rand() * 6;

  wraiths.push({
    mesh: wraithMesh(),
    x, z,
    y: heightAt(Math.round(x), Math.round(z), wiAt(w)) + 1.9,
    w,
    wPhase: rand() * Math.PI * 2,
    hp: 4,
    hitCooldown: 0,
    respawnAt: 0
  });

  const wraith = wraiths[wraiths.length - 1];

  wraith.perceptionMesh = engine.addPerception(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.7, 0.8),
      new THREE.MeshBasicMaterial({
        color: 0x6f86b8,
        transparent: true,
        opacity: 0.4
      })
    )
  );

  scene.add(wraith.mesh);
}

function wraithVisible(wraith) {
  return Math.abs(player.w - wraith.w) < 0.9;
}

function updateWraiths(dt) {
  for (const e of wraiths) {
    const vis = wraithVisible(e);

    e.mesh.visible = vis;

    if (e.perceptionMesh) {
      e.perceptionMesh.visible = Math.abs(player.w - e.w) < 4;
      e.perceptionMesh.position.set(e.x, e.w, e.z);
    }

    if (!vis) continue;

    const dx = player.x - e.x;
    const dz = player.z - e.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 14 && dist > 0.001) {
      const speed = 2.3 * dt;

      e.x += (dx / dist) * speed;
      e.z += (dz / dist) * speed;
    }

    const ground = heightAt(Math.round(e.x), Math.round(e.z), wiAt(e.w));

    e.y += ((ground + 1.9 + Math.sin(worldClock * 2 + e.wPhase) * 0.15) - e.y) * Math.min(1, dt * 4);

    e.w += Math.sin(worldClock * 0.23 + e.wPhase) * 0.4 * dt;

    const sliceFade = 1 - Math.abs(player.w - e.w) / 0.9;

    e.mesh.material.opacity = 0.3 + 0.6 * Math.max(0, sliceFade);
    e.mesh.position.set(e.x, e.y, e.z);

    e.hitCooldown = Math.max(0, e.hitCooldown - dt);

    if (dist < 1.0 && e.hitCooldown === 0) {
      e.hitCooldown = 1.2;
      damagePlayer(12, 'A wraith phases through you.');
    }
  }
}

function damagePlayer(amount, message) {
  playerHP = Math.max(0, playerHP - amount);
  lastHitAt = worldClock;

  if (hpFill) {
    hpFill.style.width = `${playerHP}%`;
    hpFill.style.background = playerHP > 40 ? '#8cf0d0' : '#f08c8c';
  }

  if (message) worldToast(message);

  if (playerHP <= 0) {
    playerHP = 100;

    if (hpFill) {
      hpFill.style.width = '100%';
      hpFill.style.background = '#8cf0d0';
    }

    respawnTo(customSpawn);
    worldToast('You wake at the bed. The ridge is quiet again.');
  }
}

function hitWraith() {
  raycaster.far = 3.5;
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);

  const visibleMeshes = wraiths.filter(e => wraithVisible(e)).map(e => e.mesh);

  const hits = raycaster.intersectObjects(visibleMeshes, false);

  if (!hits.length) return false;

  const e = wraiths.find(w => w.mesh === hits[0].object);

  if (!e) return false;

  e.hp--;
  e.mesh.material.emissiveIntensity = 2.5;

  setTimeout(() => {
    if (e.mesh.material) e.mesh.material.emissiveIntensity = 0.6;
  }, 150);

  if (e.hp <= 0) {
    scene.remove(e.mesh);
    disposeMesh(e.mesh);

    if (e.perceptionMesh) {
      engine.removePerception(e.perceptionMesh);
      e.perceptionMesh.geometry.dispose();
      e.perceptionMesh.material.dispose();
    }

    wraiths = wraiths.filter(w => w !== e);

    const rand = mulberry32(seedNum + wraiths.length + Math.floor(worldClock));
    setTimeout(() => {
      if (active) spawnWraith(rand);
    }, 20000);
  }

  return true;
}

// ------------------------------------------------------------
// Artifacts
// ------------------------------------------------------------

let artifactState = [];
let artifactMeshes = [];

function generateArtifacts(rand, blurbs) {
  const wChoices = [0, 0, 0, 0, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, 3, -0.75];

  for (let i = 0; i < 14; i++) {
    let x, z, tries = 0;

    do {
      x = Math.round(-60 + rand() * 120);
      z = Math.round(-60 + rand() * 120);
      tries++;
    } while (Math.hypot(x, z) < 14 && tries < 20);

    const w = wChoices[i];
    const y = heightAt(x, z, wiAt(w)) + 1.4;

    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x8cf0d0,
      emissive: 0x8cf0d0,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9
    }));

    mesh.position.set(x + 0.5, y, z + 0.5);
    scene.add(mesh);

    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0x8cf0d0,
        transparent: true,
        opacity: 0.45
      })
    );

    marker.position.set(x + 0.5, w, z + 0.5);
    engine.addPerception(marker);

    artifactMeshes.push(mesh);

    artifactState.push({
      id: i,
      x: x + 0.5, y, z: z + 0.5, w,
      mesh,
      perceptionMesh: marker,
      blurb: blurbs?.artifacts?.[i] ?? 'A small object that does not belong to this slice.',
      collected: false
    });
  }
}

function restoreArtifactMeshes() {
  for (const a of artifactState) {
    if (a.collected) {
      scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      a.mesh.material.dispose();

      if (a.perceptionMesh) {
        engine.removePerception(a.perceptionMesh);
        a.perceptionMesh.geometry.dispose();
        a.perceptionMesh.material.dispose();
      }
    }
  }
}

function updateArtifacts(dt) {
  let found = 0;

  for (const a of artifactState) {
    if (a.collected) continue;

    found++;

    a.mesh.rotation.y += dt * 0.9;

    const sliceVis = Math.abs(player.w - a.w) <= 0.6;

    a.mesh.visible = sliceVis;

    if (a.perceptionMesh) {
      a.perceptionMesh.visible = Math.abs(player.w - a.w) < 4;
    }

    if (!sliceVis) continue;

    const d = Math.hypot(player.x - a.x, player.y + 0.9 - a.y, player.z - a.z);

    if (d < 1.4) {
      a.collected = true;

      scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      a.mesh.material.dispose();

      if (a.perceptionMesh) {
        engine.removePerception(a.perceptionMesh);
        a.perceptionMesh.geometry.dispose();
        a.perceptionMesh.material.dispose();
      }

      const total = artifactState.length;
      const got = artifactState.filter(s => s.collected).length;

      if (artifactLabel) artifactLabel.textContent = `ARTIFACTS ${got}/${total}`;

      worldToast(`${a.blurb}`);

      queueSave();
    }
  }
}

// ------------------------------------------------------------
// Landmarks
// ------------------------------------------------------------

let landmarkTexts = {};
let visitedLandmarks = new Set();

function checkLandmarks() {
  for (const l of LANDMARKS) {
    if (visitedLandmarks.has(l.key)) continue;

    const d = Math.hypot(player.x - l.x, player.z - l.z);

    if (d < (l.r ?? 7)) {
      visitedLandmarks.add(l.key);

      const info = landmarkTexts[l.key];

      if (info) {
        worldToast(`${info.name} — ${info.blurb}`);
      }
    }
  }
}

// ------------------------------------------------------------
// Bed / custom respawn
// ------------------------------------------------------------

let customSpawn = [0, 5, 6, 0];
let bedPos = null;

function checkBed(dt) {
  if (!bedPos) return;

  if (!wantSetSpawn) return;

  wantSetSpawn = false;

  const d = Math.hypot(player.x - (bedPos[0] + 0.5), player.z - (bedPos[2] + 0.5));

  if (d < 2.2) {
    customSpawn = [bedPos[0] + 0.5, bedPos[1] + 1.05, bedPos[2] + 1.5, 0];
    worldToast('The bed is set as your anchor. Death will return you here.');
    queueSave();
  }
}

let wantSetSpawn = false;

// ------------------------------------------------------------
// Tutorial
// ------------------------------------------------------------

const TUTORIAL = [
  'Click to capture the mouse. WASD to walk, SHIFT to run, SPACE to jump.',
  'SCROLL the wheel or press E / Q to shift along W. The corner map shows the slices above and below.',
  'HOLD LEFT-CLICK on a block to mine it. RIGHT-CLICK places a block. Keys 1–5 pick the block.',
  'Every block lives in a W slice. You can only mine the slice you stand in — the faint blocks you see beside you are the next slices, out of reach.',
  'Terrain folds with W. E / Q phases you into a neighbour slice: the same hill may be taller, gone, or torn open into a void. Watch the corner map.',
  'Wraiths exist only in certain W slices. Shift W to face them — or to slip away.',
  'Fourteen artifacts are scattered across the slices. Some hang in W you must shift into.',
  'Press F beside the cabin bed to anchor where you wake.'
];

let tutorialStep = 0;
let tutorialTimer = 0;

function updateTutorial(dt) {
  if (tutorialStep >= TUTORIAL.length) return;

  tutorialTimer -= dt;

  showHint(TUTORIAL[tutorialStep], 8);

  if (tutorialTimer <= 0) {
    tutorialStep++;
    tutorialTimer = 8;

    if (tutorialStep >= TUTORIAL.length && hintEl) {
      hintEl.textContent = '';
    }
  }
}

// ------------------------------------------------------------
// Input (world-specific: mining, placing, hotbar, bed)
// ------------------------------------------------------------

document.addEventListener('mousedown', e => {
  if (!active || !getRunning() || !document.pointerLockElement) return;

  if (e.button === 0) {
    if (!hitWraith()) {
      mineHeld = true;
    }
  } else if (e.button === 2) {
    placeQueued = true;
  }
});

document.addEventListener('mouseup', e => {
  if (e.button === 0) {
    mineHeld = false;
  }
});

document.addEventListener('contextmenu', e => {
  if (active) e.preventDefault();
});

document.addEventListener('keydown', e => {
  if (!active || !getRunning()) return;

  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));

    if (n >= 1 && n <= HOTBAR_TYPES.length) {
      selected = n - 1;
      renderHotbar();
    }
  }

  if (e.code === 'KeyF') {
    wantSetSpawn = true;
  }

  if (e.code === 'KeyR') {
    respawnTo(customSpawn);
    worldToast('Returned to your anchor.');
  }
});

// ------------------------------------------------------------
// Frame handler
// ------------------------------------------------------------

function worldFrame(dt) {
  worldClock += dt;

  // Phasing into a neighbouring slice can shove the player into
  // that slice's rock: lift them out, or undo the shift.
  if (voxelCollides(player.x, player.y, player.z)) {
    let freed = false;

    for (let up = 0.05; up <= 2; up += 0.05) {
      if (!voxelCollides(player.x, player.y + up, player.z)) {
        player.y += up;
        freed = true;
        break;
      }
    }

    if (!freed && lastSafeW !== null && lastSafeW !== player.w) {
      player.w = lastSafeW;
      engine.updateSlice();
    }
  } else {
    lastSafeW = player.w;
  }

  updateSliceVisibility();
  rebuildDirtyChunks();
  tryMine(dt);
  tryPlace();

  // Gentle regen when out of trouble.
  if (playerHP < 100 && worldClock - lastHitAt > 6) {
    playerHP = Math.min(100, playerHP + 2 * dt);

    if (hpFill) hpFill.style.width = `${playerHP}%`;
  }

  updateWraiths(dt);
  updateArtifacts(dt);
  checkLandmarks();
  checkBed(dt);
  updateTutorial(dt);

  if (toastTimer > 0) {
    toastTimer -= dt;

    if (toastTimer <= 0 && toastEl) toastEl.textContent = '';
  }
}

// ------------------------------------------------------------
// Entry / exit
// ------------------------------------------------------------

let showScreenFn = null;

export function init(deps) {
  showScreenFn = deps.showScreen;
  createWorldHUD();
}

// Debug/test snapshot of world internals.
export function _debug() {
  return {
    active,
    wraiths: wraiths.length,
    wraithPos: wraiths.map(e => ({ x: +e.x.toFixed(1), z: +e.z.toFixed(1), w: +e.w.toFixed(2) })),
    collected: artifactState.filter(a => a.collected).length,
    artifacts: artifactState.length,
    changed: changed.size,
    changedPairs: [...changed.entries()].slice(0, 6).map(([k, t]) => `${k}=${t}`),
    mining: mining ? { ...mining } : null,
    mineHeld,
    placeQueued,
    hp: playerHP,
    spawn: customSpawn,
    bed: bedPos,
    inventory: { ...inventory },
    nearest: artifactState
      .filter(a => !a.collected)
      .slice(0, 3)
      .map(a => ({ x: a.x, y: a.y, z: a.z, w: a.w }))
  };
}

export function enterWorld(seed) {
  seedStr = seed;
  const seedGen = xmur3(seed);
  seedNum = seedGen();
  const rand = mulberry32(seedGen());

  clearWorld();
  disposeChunks();
  changed = new Map();
  dirtyChunks = new Set();
  wraiths = [];
  artifactState = [];
  artifactMeshes = [];
  visitedLandmarks = new Set();
  mining = null;
  mineHeld = false;
  worldClock = 0;
  tutorialStep = 0;
  tutorialTimer = 8;
  selected = 0;
  inventory = {};
  playerHP = 100;

  if (hpFill) {
    hpFill.style.width = '100%';
    hpFill.style.background = '#8cf0d0';
  }

  data = new Uint8Array(W_SLICES * SZ * SZ * WORLD_H);

  generateTerrain();

  for (let wi = 0; wi < W_SLICES; wi++) {
    generateTrees(rand, wi);
  }

  generateLandmarks();

  const floorY = generateCabin();

  customSpawn = [0.5, floorY + 1.05, 5, 0];
  bedPos = [-1, floorY + 1, -1];

  engine.setWLimit(4);
  lastSafeW = null;
  sliceMode = null;

  loadSavedChanges();

  for (let cx = 0; cx < CHUNKS; cx++) {
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let wi = 0; wi < W_SLICES; wi++) {
        buildChunk(cx, cz, wi);
      }
    }
  }

  updateSliceVisibility();

  const spawn = [customSpawn[0], customSpawn[1], customSpawn[2], customSpawn[3] ?? 0];

  loadWorld({
    name: 'Open World',
    boxes: [],
    spawn
  });

  renderHotbar();

  if (artifactLabel) artifactLabel.textContent = 'ARTIFACTS 0/14';

  Promise.all([
    fetch('./prose/landmarks.json').then(r => r.ok ? r.json() : null),
    fetch('./prose/artifacts.json').then(r => r.ok ? r.json() : null)
  ]).then(([landmarks, artifacts]) => {
    if (!active && !showScreenFn) return;

    if (landmarks) {
      for (const l of landmarks.landmarks ?? []) {
        landmarkTexts[l.key] = l;
      }
    }

    if (artifacts) {
      artifactState.forEach(a => {
        a.blurb = artifacts.artifacts?.[a.id] ?? a.blurb;
      });
    }
  });

  generateArtifacts(rand, null);

  if (savedArtifacts.length) {
    const collectedIds = new Set(savedArtifacts);

    for (const a of artifactState) {
      a.collected = collectedIds.has(a.id);
    }
  }

  restoreArtifactMeshes();

  const got = artifactState.filter(s => s.collected).length;
  if (artifactLabel) artifactLabel.textContent = `ARTIFACTS ${got}/14`;

  for (let i = 0; i < 8; i++) {
    spawnWraith(rand);
  }

  active = true;

  setCollider(voxelCollides);
  setFrameHandler(worldFrame);

  if ($('hud')) $('hud').classList.remove('hidden');
  hudEl.classList.remove('hidden');

  showScreenFn?.(null);

  engine.setRunning(true);

  document.getElementById('view')?.requestPointerLock?.();

  worldToast(`World "${seed}" folded into being.`);
}

export function exitWorld() {
  active = false;

  setCollider(null);
  setFrameHandler(null);
  engine.setWLimit(engine.W_LIMIT);

  for (const e of wraiths) {
    scene.remove(e.mesh);
    disposeMesh(e.mesh);

    if (e.perceptionMesh) {
      engine.removePerception(e.perceptionMesh);
      e.perceptionMesh.geometry.dispose();
      e.perceptionMesh.material.dispose();
    }
  }

  wraiths = [];

  for (const a of artifactState) {
    if (!a.collected) {
      scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      a.mesh.material.dispose();
    }

    if (a.perceptionMesh) {
      engine.removePerception(a.perceptionMesh);
      a.perceptionMesh.geometry.dispose();
      a.perceptionMesh.material.dispose();
    }
  }

  artifactState = [];
  artifactMeshes = [];

  disposeChunks();
  clearWorld();

  hudEl.classList.add('hidden');
}

const $ = (id) => document.getElementById(id);
