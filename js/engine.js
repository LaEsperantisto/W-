import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { settings } from './options.js';

export { THREE };

const $ = (id) => document.getElementById(id);

// ============================================================
// MAIN 3D SCENE (XYZ)
// ============================================================

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080d16);
scene.fog = new THREE.Fog(0x080d16, 18, 65);

export const camera = new THREE.PerspectiveCamera(
  settings.fov,
  window.innerWidth / window.innerHeight,
  0.1,
  120
);

camera.rotation.order = 'YXZ';

const viewCanvas = $('view');
export const renderer = new THREE.WebGLRenderer({
  canvas: viewCanvas,
  antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting
scene.add(new THREE.HemisphereLight(0xb9d9ed, 0x18202b, 1.7));

export const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(-8, 16, 7);
sun.castShadow = true;
scene.add(sun);

// Reference Grid
const grid = new THREE.GridHelper(100, 100, 0x294452, 0x172a37);
grid.position.y = -0.02;
scene.add(grid);

let perceptionRenderer = null;
let perceptionScene = null;
let perceptionCamera = null;
let perceptionCanvas = null;
let perceptionGrid = null;
let perceptionPanel = null;

function createPerceptionView() {
  const panel = document.createElement('div');

  panel.id = 'perception-panel';
  panel.innerHTML = `
    <canvas id="perception-canvas"></canvas>
  `;

  document.body.appendChild(panel);
  perceptionPanel = panel;

  // Transparent corner overlay.
  const style = document.createElement('style');

  style.textContent = `
    #perception-panel {
      position: fixed;
      top: 12px;
      right: 12px;
      width: 500px;
      height: 220px;
      z-index: 1000;
      pointer-events: none;
      background: transparent;
    }

    #perception-canvas {
      display: block;
      width: 100%;
      height: 100%;
      background: transparent;
    }

    @media (max-width: 600px) {
      #perception-panel {
        top: 5px;
        right: 5px;
        width: 180px;
        height: 135px;
      }
    }
  `;

  document.head.appendChild(style);

  perceptionCanvas = $('perception-canvas');

  perceptionRenderer = new THREE.WebGLRenderer({
    canvas: perceptionCanvas,
    antialias: true,
    alpha: true
  });

  perceptionRenderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
  );

  perceptionRenderer.setSize(
    perceptionCanvas.clientWidth,
    perceptionCanvas.clientHeight
  );

  perceptionRenderer.setClearColor(0x000000, 0);

  perceptionScene = new THREE.Scene();

  perceptionScene.fog = new THREE.Fog(0x080d16, 18, 65);

  perceptionCamera = new THREE.PerspectiveCamera(
    75,
    perceptionCanvas.clientWidth / perceptionCanvas.clientHeight,
    0.1,
    120
  );

  perceptionCamera.rotation.order = 'YXZ';

  // Lighting for the second scene.
  perceptionScene.add(
    new THREE.HemisphereLight(0xb9d9ed, 0x18202b, 1.7)
  );

  const perceptionSun = new THREE.DirectionalLight(
    0xffffff,
    2.0
  );

  perceptionSun.position.set(-8, 16, 7);
  perceptionScene.add(perceptionSun);
}

function renderPerceptionView() {
  if (!perceptionRenderer || !perceptionCamera) return;
  if (settings.overlay !== 'perception') return;

  // Position the camera in WXZ coordinates; pitch drifts the
  // vertical (W) position so looking around reveals the slices.
  perceptionCamera.position.set(
    player.x,
    player.w - player.pitch * settings.perceptionDrift,
    player.z
  );

  // The perception camera has its own orientation.
  // It follows horizontal rotation but never follows pitch.
  perceptionCamera.rotation.order = 'YXZ';
  perceptionCamera.rotation.x = player.pitch;
  perceptionCamera.rotation.y = player.yaw;
  perceptionCamera.rotation.z = 0;

  // Create the grid if necessary.
  if (!perceptionGrid) {
    perceptionGrid = new THREE.GridHelper(
      100,
      100,
      0x4488ff,
      0x555555
    );

    perceptionScene.add(perceptionGrid);
  }

  // Keep the grid centred on the player.
  perceptionGrid.position.set(
    player.x,
    player.w,
    player.z
  );

  // Render the perception view.
  perceptionRenderer.render(
    perceptionScene,
    perceptionCamera
  );
}

// ============================================================
// SLICE VIEWS OVERLAY
// ============================================================

// Two small first-person views of what the player would see if
// they stood at player.w + 1 and player.w - 1.

let viewsRenderer = null;
let viewsCanvas = null;
let viewsPanel = null;
let viewCamera = null;

// Modes provide their own per-slice visibility switch: fn(wv)
// applies the view and returns a restore function.
// Null uses the level hyperboxes.
let sliceViewFilter = null;

export function setSliceViewFilter(fn) {
  sliceViewFilter = fn;
}

function createSliceViews() {
  const panel = document.createElement('div');

  panel.id = 'slice-views-panel';
  panel.innerHTML = `
    <canvas id="slice-views-canvas"></canvas>
    <span class="slice-view-label left">W + 1</span>
    <span class="slice-view-label right">W - 1</span>
  `;

  document.body.appendChild(panel);
  viewsPanel = panel;

  const style = document.createElement('style');

  style.textContent = `
    #slice-views-panel {
      position: fixed;
      top: 12px;
      right: 12px;
      width: 440px;
      height: 220px;
      z-index: 1000;
      pointer-events: none;
      background: transparent;
    }

    #slice-views-canvas {
      display: block;
      width: 100%;
      height: 100%;
      background: transparent;
    }

    .slice-view-label {
      position: absolute;
      top: 6px;
      font: 600 11px/1 system-ui, sans-serif;
      letter-spacing: 0.08em;
      color: #9fc7ff;
      text-shadow: 0 1px 2px #000;
    }

    .slice-view-label.left { left: 10px; }
    .slice-view-label.right { right: 10px; }

    @media (max-width: 600px) {
      #slice-views-panel {
        top: 5px;
        right: 5px;
        width: 320px;
        height: 160px;
      }
    }
  `;

  document.head.appendChild(style);

  viewsCanvas = $('slice-views-canvas');

  viewsRenderer = new THREE.WebGLRenderer({
    canvas: viewsCanvas,
    antialias: true,
    alpha: true
  });

  viewsRenderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
  );

  viewsRenderer.setSize(
    viewsCanvas.clientWidth,
    viewsCanvas.clientHeight
  );

  viewsRenderer.setClearColor(0x000000, 0);
  viewsRenderer.setScissorTest(true);

  viewCamera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, 300);
  viewCamera.rotation.order = 'YXZ';
}

// Default: hyperboxes whose W interval contains wv.
function levelSliceView(wv) {
  const saved = [];

  for (const item of objects) {
    saved.push(item.mesh, item.mesh.visible);

    item.mesh.visible = Math.abs(wv - item.pos4[3]) <= item.size4[3] / 2;
  }

  return () => {
    for (let i = 0; i < saved.length; i += 2) {
      saved[i].visible = saved[i + 1];
    }
  };
}

function renderSliceViews() {
  if (!viewsRenderer || !viewCamera) return;
  if (settings.overlay !== 'views') return;

  const filter = sliceViewFilter || levelSliceView;
  const half = Math.round(viewsCanvas.clientWidth / 2);
  const h = viewsCanvas.clientHeight;

  // First-person vantage: the same eye and look direction as the
  // main camera, one slice up and one slice down along W.
  viewCamera.fov = settings.fov;
  viewCamera.aspect = half / h;
  viewCamera.updateProjectionMatrix();

  for (let i = 0; i < 2; i++) {
    const wv = player.w + (i === 0 ? 1 : -1);
    const x = i === 0 ? 0 : half;

    // The filter mutates scene visibility; the restore MUST run
    // even if the render throws, or the main view would keep the
    // view's slice and the player would "see" the wrong slice.
    let restore = null;

    try {
      restore = filter(wv);

      viewCamera.position.set(player.x, player.y + 1.55, player.z);
      viewCamera.rotation.set(player.pitch, player.yaw, 0);

      viewsRenderer.setViewport(x, 0, half, h);
      viewsRenderer.setScissor(x, 0, half, h);
      viewsRenderer.render(scene, viewCamera);
    } finally {
      if (restore) restore();
    }
  }
}

// ============================================================
// PLAYER STATE
// ============================================================

// The player object is never replaced; modes mutate it in place
// so every importer of this binding sees the same state.
export const player = {
  x: 0,
  y: 1.7,
  z: 5,
  w: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  onGround: false
};

export const W_LIMIT = 8;

let wLimit = 8;

// Open World tightens the W range; levels use the full ±8.
export function setWLimit(limit) {
  wLimit = Math.max(0, Math.min(W_LIMIT, limit));

  if (Math.abs(player.w) > wLimit) {
    player.w = Math.max(-wLimit, Math.min(wLimit, player.w));
    updateSlice();
  }
}

export const PLAYER_RADIUS = 0.32;
export const PLAYER_HEIGHT = 1.7;

let keys = {};
let running = false;
let lastTime = 0;
let clock = 0;

export function setKey(code, down) {
  keys[code] = down;
}

export function clearKeys() {
  keys = {};
}

export function setRunning(value) {
  running = value;
}

export function getRunning() {
  return running;
}

export function look(dx, dy) {
  player.yaw -= dx * 0.0022 * settings.sensitivity;
  player.pitch -= dy * 0.0022 * settings.sensitivity * (settings.invertY ? -1 : 1);

  player.pitch = Math.max(
    -Math.PI / 2 + 0.03,
    Math.min(Math.PI / 2 - 0.03, player.pitch)
  );
}

// ============================================================
// WORLD STATE
// ============================================================

export let objects = [];
export let solids = [];
export let goal = null;
let movers = [];

let currentLevel = null;

export function getCurrentLevel() {
  return currentLevel;
}

// Modes may replace the collision test entirely (voxel world).
let colliderOverride = null;

export function setCollider(fn) {
  colliderOverride = fn;
}

// Optional per-frame callback (open-world simulation).
let frameHandler = null;

export function setFrameHandler(fn) {
  frameHandler = fn;
}

// Called when the player reaches the goal box.
let goalHandler = null;

export function setGoalHandler(fn) {
  goalHandler = fn;
}

// Extra perception-scene content (world-mode markers).
export function addPerception(obj) {
  perceptionScene?.add(obj);

  return obj;
}

export function removePerception(obj) {
  perceptionScene?.remove(obj);
}

// ============================================================
// MATERIALS
// ============================================================

// Each mesh gets its own material: updateSlice() fades objects
// independently, so materials must never be shared between boxes.
function material(hex, opacity = 1, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.78,
    metalness: 0.08,
    opacity,
    transparent: opacity < 1,
    emissive,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide
  });
}

// ============================================================
// WORLD MANAGEMENT
// ============================================================

export function disposeMesh(mesh) {
  mesh.geometry.dispose();
  mesh.material.dispose();

  for (const child of mesh.children) {
    child.geometry.dispose();
    child.material.dispose();
  }
}

export function clearWorld() {
  for (const obj of objects) {
    scene.remove(obj.mesh);
    disposeMesh(obj.mesh);

    if (obj.perceptionMesh && perceptionScene) {
      perceptionScene.remove(obj.perceptionMesh);
      disposeMesh(obj.perceptionMesh);
    }
  }

  objects = [];
  solids = [];
  movers = [];
  goal = null;
  currentLevel = null;
}

/**
 * Parses and converts a 4D specification.
 *
 * Supports:
 * pos: [x, y, z, w]
 * or legacy pos: [x, y, z], w: number
 *
 * Supports:
 * size: [sx, sy, sz, sw]
 * or legacy size: [sx, sy, sz], w_size: number
 *
 * Optional move: {axis:'x'|'y'|'z', range, period, phase}
 * oscillates the box sinusoidally along that axis.
 */
function parse4DSpec(spec) {
  const pos = [
    spec.pos[0] ?? 0,
    spec.pos[1] ?? 0,
    spec.pos[2] ?? 0,
    spec.pos[3] ?? (spec.w ?? 0)
  ];

  let size;

  if (spec.size.length >= 4) {
    size = [
      spec.size[0],
      spec.size[1],
      spec.size[2],
      spec.size[3]
    ];
  } else {
    size = [
      spec.size[0],
      spec.size[1],
      spec.size[2],
      spec.w_size ?? 1.2
    ];
  }

  return {
    pos,
    size,
    colour: spec.colour,
    solid: spec.solid !== false,
    move: spec.move ?? null
  };
}

// ============================================================
// HYPERBOX CREATION
// ============================================================

function addHyperBox(rawSpec, isGoal = false) {
  const spec = parse4DSpec(rawSpec);

  // ----------------------------------------------------------
  // Main XYZ mesh
  // ----------------------------------------------------------

  const geo = new THREE.BoxGeometry(
    spec.size[0],
    spec.size[1],
    spec.size[2]
  );

  const mat = material(
    spec.colour ?? (isGoal ? 0x8cf0d0 : 0x7895a8),
    isGoal ? 0.9 : 0.35, // Slightly transparent so you can see when inside
    isGoal ? 0x164b3b : 0
  );

  const mesh = new THREE.Mesh(geo, mat);

  // Add edge outlines so blocks are clearly defined from the inside
  const edgesGeo = new THREE.EdgesGeometry(geo);
  const edgesMat = new THREE.LineBasicMaterial({
    color: spec.colour ?? (isGoal ? 0x8cf0d0 : 0x7895a8),
    transparent: true,
    opacity: 0.8
  });
  const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
  mesh.add(edgeLines);

  mesh.position.set(
    spec.pos[0],
    spec.pos[1],
    spec.pos[2]
  );

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  scene.add(mesh);

  // ----------------------------------------------------------
  // WXZ mesh (Perception View)
  // ----------------------------------------------------------

  const perceptionGeometry = new THREE.BoxGeometry(
    spec.size[0],
    spec.size[3],
    spec.size[2]
  );
  const perceptionMaterial = mat.clone();

  // Render both sides of the geometry.
  perceptionMaterial.side = THREE.DoubleSide;
  

  // Prevent transparent surfaces from incorrectly
  // writing to the depth buffer.
  perceptionMaterial.depthWrite = false;

  const perceptionMesh = new THREE.Mesh(
    perceptionGeometry,
    perceptionMaterial
  );

  // Never cull perception meshes based on their bounds.
  perceptionMesh.frustumCulled = false;
  perceptionMesh.renderOrder = 1;

  // Add matching outlines to the perception mesh.
  const perceptionEdgesGeo = new THREE.EdgesGeometry(perceptionGeometry);

  const perceptionEdgeMaterial = edgesMat.clone();
  perceptionEdgeMaterial.depthTest = false;
  perceptionEdgeMaterial.depthWrite = false;

  const perceptionEdgeLines = new THREE.LineSegments(
    perceptionEdgesGeo,
    perceptionEdgeMaterial
  );

  perceptionEdgeLines.renderOrder = 2;
  perceptionMesh.add(perceptionEdgeLines);

  perceptionMesh.position.set(
    spec.pos[0],
    spec.pos[3],
    spec.pos[2]
  );

  perceptionMesh.castShadow = true;
  perceptionMesh.receiveShadow = true;

  if (perceptionScene) {
    perceptionScene.add(perceptionMesh);
  }

  const item = {
    mesh,
    perceptionMesh,
    pos4: spec.pos,
    size4: spec.size,
    solid: spec.solid,
    isGoal,
    baseTransparent: mat.transparent
  };

  objects.push(item);

  if (item.solid && !isGoal) {
    solids.push(item);
  }

  if (spec.move) {
    movers.push({
      item,
      axis: spec.move.axis ?? 'y',
      range: spec.move.range ?? 1,
      period: spec.move.period ?? 4,
      phase: spec.move.phase ?? 0
    });
  }

  if (isGoal) {
    goal = item;
  }
}

// ============================================================
// LEVEL LOADING
// ============================================================

export function loadWorld(level) {
  clearWorld();

  currentLevel = level;
  clock = 0;

  for (const b of level.boxes) {
    addHyperBox(b);
  }

  if (level.goal) {
    addHyperBox(level.goal, true);
  }

  player.x = level.spawn[0];
  player.y = level.spawn[1];
  player.z = level.spawn[2];
  player.w = level.spawn[3] ?? 0;

  player.vy = 0;
  player.yaw = 0;
  player.pitch = 0;
  player.onGround = false;

  camera.position.set(
    player.x,
    player.y + 1.55,
    player.z
  );

  camera.rotation.set(0, 0, 0);

  if ($('level-name')) {
    $('level-name').textContent = level.name.toUpperCase();
  }

  updatePos();
  updateSlice();
}

// ============================================================
// PLAYER POSITION
// ============================================================

export function updatePos() {
  if ($('w-value')) $('w-value').textContent = player.w.toFixed(2);
  if ($('x-value')) $('x-value').textContent = player.x.toFixed(2);
  if ($('y-value')) $('y-value').textContent = player.y.toFixed(2);
  if ($('z-value')) $('z-value').textContent = player.z.toFixed(2);
}

// ============================================================
// 4D SLICE CALCULATION
// ============================================================

/**
 * Main view:
 *
 * A hyperbox intersects the XYZ slice when W = player.w.
 * It fades as the player nears the edge of its W interval
 * and disappears past it.
 *
 * The perception view shows every object's X/Z footprint and
 * W extent (W mapped to its vertical axis), like a slice map.
 */
export function updateSlice() {
  for (const item of objects) {
    const wCenter = item.pos4[3];
    const halfW = item.size4[3] / 2;

    const distanceW = Math.abs(player.w - wCenter);

    if (distanceW <= halfW) {
      item.mesh.visible = true;

      const mat = item.mesh.material;

      if (!settings.wFade) {
        // No distance fade: fully inside means fully opaque.
        if (mat.transparent || mat.opacity !== 1) {
          mat.transparent = false;
          mat.opacity = 1;
          mat.needsUpdate = true;
        }
      } else if (item.baseTransparent) {
        if (!mat.transparent) {
          mat.transparent = true;
          mat.needsUpdate = true;
        }

        const factor = 1 - (distanceW / (halfW + 0.001));

        mat.opacity = Math.max(0.2, factor);
      }
    } else {
      item.mesh.visible = false;
    }
  }
}

// ============================================================
// W MOVEMENT
// ============================================================

export function changeW(amount) {
  const next = Math.max(
    -wLimit,
    Math.min(
      wLimit,
      Math.round((player.w + amount) * 100) / 100
    )
  );

  if (next === player.w) return;

  player.w = next;

  updateSlice();
}

// ============================================================
// COLLISION
// ============================================================

function intersectsBox(x, y, z, item) {
  const p = item.mesh.position;
  const s = item.size4;

  return (
    x + PLAYER_RADIUS > p.x - s[0] / 2 &&
    x - PLAYER_RADIUS < p.x + s[0] / 2 &&

    y + PLAYER_HEIGHT > p.y - s[1] / 2 &&
    y < p.y + s[1] / 2 &&

    z + PLAYER_RADIUS > p.z - s[2] / 2 &&
    z - PLAYER_RADIUS < p.z + s[2] / 2
  );
}

export function collides(x, y, z) {
  if (colliderOverride) {
    return colliderOverride(x, y, z);
  }

  return solids.some(
    o => o.mesh.visible && intersectsBox(x, y, z, o)
  );
}

export function moveAxis(axis, amount) {
  const next = {
    x: player.x,
    y: player.y,
    z: player.z
  };

  next[axis] += amount;

  if (!collides(next.x, next.y, next.z)) {
    player[axis] = next[axis];
  } else if (axis === 'y' && amount < 0) {
    player.vy = 0;
    player.onGround = true;
  }
}

// ============================================================
// MOVING HYPERBOXES
// ============================================================

function advanceMovers(dt) {
  clock += dt;

  for (const m of movers) {
    const axisIndex = m.axis === 'x' ? 0 : m.axis === 'z' ? 2 : 1;

    const offset = Math.sin(
      clock * Math.PI * 2 / m.period + m.phase
    ) * m.range;

    const base = m.item.pos4;
    const mesh = m.item.mesh;

    const nx = base[0] + (axisIndex === 0 ? offset : 0);
    const ny = base[1] + (axisIndex === 1 ? offset : 0);
    const nz = base[2] + (axisIndex === 2 ? offset : 0);

    const dx = nx - mesh.position.x;
    const dy = ny - mesh.position.y;
    const dz = nz - mesh.position.z;

    mesh.position.set(nx, ny, nz);

    // Perception mesh maps W onto the vertical axis; its own
    // W never moves, but its X and Z follow the box.
    if (m.item.perceptionMesh) {
      m.item.perceptionMesh.position.x = nx;
      m.item.perceptionMesh.position.z = nz;
    }

    if (!mesh.visible) continue;

    // Ride-along: carry the player if standing on top.
    const s = m.item.size4;
    const top = ny + s[1] / 2;

    if (
      player.onGround &&
      Math.abs(player.y - top) < 0.12 &&
      Math.abs(player.x - nx) <= s[0] / 2 + PLAYER_RADIUS &&
      Math.abs(player.z - nz) <= s[2] / 2 + PLAYER_RADIUS
    ) {
      moveAxis('x', dx);
      moveAxis('z', dz);
      moveAxis('y', dy);

      if (dy > 0) {
        player.onGround = true;
      }
    }
  }
}

// ============================================================
// GOAL
// ============================================================

function checkGoal() {
  if (!goal || !goal.mesh.visible || !goalHandler) return;

  const p = goal.mesh.position;
  const s = goal.size4;

  if (
    Math.abs(player.x - p.x) < s[0] / 2 + 0.5 &&
    Math.abs(player.y - p.y) < s[1] / 2 + 1.0 &&
    Math.abs(player.z - p.z) < s[2] / 2 + 0.5
  ) {
    running = false;

    document.exitPointerLock?.();

    goalHandler(currentLevel);
  }
}

// ============================================================
// PLAYER UPDATE
// ============================================================

function update(dt) {
  if (!running) return;

  advanceMovers(dt);

  const speed =
    (keys.ShiftLeft || keys.ShiftRight) ? 8 : 4.5;

  const forward = new THREE.Vector3(
    -Math.sin(player.yaw),
    0,
    -Math.cos(player.yaw)
  );

  const right = new THREE.Vector3(
    Math.cos(player.yaw),
    0,
    -Math.sin(player.yaw)
  );

  const move = new THREE.Vector3();

  if (keys.KeyW) move.add(forward);
  if (keys.KeyS) move.sub(forward);
  if (keys.KeyD) move.add(right);
  if (keys.KeyA) move.sub(right);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed * dt);
  }

  moveAxis('x', move.x);
  moveAxis('z', move.z);

  if (keys.Space && player.onGround) {
    player.vy = 6.5;
    player.onGround = false;
  }

  player.vy -= 17 * dt;

  const oldY = player.y;

  moveAxis('y', player.vy * dt);

  if (player.y === oldY && player.vy > 0) {
    player.vy = 0;
  }

  if (player.y < -12) {
    respawnTo(currentLevel?.spawn ?? [0, 1.7, 5, 0]);
  }

  // Main XYZ camera.
  camera.position.set(
    player.x,
    player.y + 1.55,
    player.z
  );

  camera.rotation.set(
    player.pitch,
    player.yaw,
    0,
    'YXZ'
  );

  if (frameHandler) {
    frameHandler(dt);
  }

  checkGoal();

  updatePos();
}

// ============================================================
// RESPAWN
// ============================================================

export function respawnTo([x, y, z, w = 0]) {
  player.x = x;
  player.y = y;
  player.z = z;
  player.w = w;

  player.vy = 0;
  player.onGround = false;

  // Respawn can land the player in a different W slice: the main
  // view's hyperbox fades and the HUD must follow immediately.
  updateSlice();
  updatePos();
}

// ============================================================
// ANIMATION
// ============================================================

function animate(t) {
  requestAnimationFrame(animate);

  const dt = Math.min(
    (t - lastTime) / 1000,
    0.04
  ) || 0;

  lastTime = t;

  update(dt);

  // Main XYZ view.
  renderer.render(scene, camera);

  // Independent WXZ view.
  renderPerceptionView();
  renderSliceViews();
}

// ============================================================
// OPTIONS APPLICATION
// ============================================================

export function applyOptions() {
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();

  const shadowsOn = settings.quality !== 'off';
  renderer.shadowMap.enabled = shadowsOn;
  sun.castShadow = shadowsOn;

  const mapSize = settings.quality === 'high' ? 2048 : 1024;

  if (sun.shadow.mapSize.width !== mapSize) {
    sun.shadow.mapSize.set(mapSize, mapSize);

    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }

  if (perceptionPanel) {
    perceptionPanel.style.display = settings.overlay === 'perception' ? '' : 'none';
  }

  if (viewsPanel) {
    viewsPanel.style.display = settings.overlay === 'views' ? '' : 'none';
  }
}

// ============================================================
// RESIZING
// ============================================================

window.addEventListener('resize', () => {
  // Main camera.
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  // WXZ camera.
  if (perceptionRenderer && perceptionCanvas) {
    perceptionRenderer.setSize(
      perceptionCanvas.clientWidth,
      perceptionCanvas.clientHeight
    );

    perceptionCamera.aspect =
      perceptionCanvas.clientWidth /
      perceptionCanvas.clientHeight;

    perceptionCamera.updateProjectionMatrix();

    perceptionCamera.up.set(0, 1, 0);
  }

  // Slice views canvas.
  if (viewsRenderer && viewsCanvas) {
    viewsRenderer.setSize(
      viewsCanvas.clientWidth,
      viewsCanvas.clientHeight
    );
  }
});

// ============================================================
// INITIALISATION
// ============================================================

createPerceptionView();
createSliceViews();
applyOptions();

requestAnimationFrame(animate);
