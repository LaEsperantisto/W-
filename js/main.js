
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $ = (id) => document.getElementById(id);
const screens = ['title-screen', 'level-screen', 'pause-screen', 'complete-screen'];
const showScreen = (id) => screens.forEach(s => {
  const el = $(s);
  if (el) el.classList.toggle('hidden', s !== id);
});

// ============================================================
// MAIN 3D SCENE (XYZ)
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080d16);
scene.fog = new THREE.Fog(0x080d16, 18, 65);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  120
);

camera.rotation.order = 'YXZ';

const viewCanvas = $('view');
const renderer = new THREE.WebGLRenderer({
  canvas: viewCanvas,
  antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting
scene.add(new THREE.HemisphereLight(0xb9d9ed, 0x18202b, 1.7));

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
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
let perceptionHorizontalRings = null;

function createPerceptionView() {
  const panel = document.createElement('div');

  panel.id = 'perception-panel';
  panel.innerHTML = `
    <canvas id="perception-canvas"></canvas>
  `;

  document.body.appendChild(panel);

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


function updatePerceptionSlice() {
  if (!perceptionScene) return;

  for (const item of objects) {
    const mesh = item.perceptionMesh;
    if (!mesh) continue;

    const centreY = item.pos4[1];
    const halfY = item.size4[1] / 2;

    // Show the object whenever the current Y slice
    // intersects it, including when the player is inside.
    mesh.visible = true;

    mesh.frustumCulled = false;
    mesh.material.side = THREE.DoubleSide;

    // Make the outlines visible from inside.
    const outline = mesh.children[0];

    if (outline) {
      outline.material.depthTest = false;
      outline.material.depthWrite = false;
      outline.renderOrder = 2;
    }

    mesh.renderOrder = 1;
  }
}

function renderPerceptionView() {
  if (!perceptionRenderer || !perceptionCamera) return;

  // Position the camera in WXZ coordinates.
  perceptionCamera.position.set(
    player.x,
    player.w,
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
// 4D WORLD DATA
// ============================================================

// Built-in Levels with 4D Hyperbox Geometry
// Position: [X, Y, Z, W]
// Size:     [SX, SY, SZ, SW]

const DEFAULT_LEVELS = [
  {
    "name": "The First Slice",
    "description": "Learn to shift through the 4th dimension (W axis) to bypass obstacles.",
    "completion": "You have successfully navigated through the 4th dimension!",
    "spawn": [0, 0.05, 5, 0],
    "boxes": [
      {
        "pos": [0, -0.5, 0, 1],
        "size": [16, 1, 18, 4],
        "colour": 0x775578
      },
      {
        "pos": [-4, 1, 0, 1],
        "size": [1, 2, 12, 4],
        "colour": 0x4a6572
      },
      {
        "pos": [4, 1, 0, 1],
        "size": [1, 2, 12, 4],
        "colour": 0x4a6572
      },
      {
        "pos": [0, 1, 1, 0],
        "size": [2, 2, 1, 1.4],
        "colour": 0x34495e
      },
      {
        "pos": [0, 1, -2, 2],
        "size": [2, 2, 1, 1.0],
        "colour": 0x56ab91
      }
    ],
    "goal": {
      "pos": [0, 1, -5.8, 2],
      "size": [1.2, 2.2, 0.35, 1.2],
      "colour": 0x8cf0d0,
      "solid": false
    }
  }
];

let levels = [];
let currentIndex = 0;
let currentLevel = null;

let objects = [];
let solids = [];
let goal = null;

let player = {
  x: 0,
  y: 1.7,
  z: 5,
  w: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  onGround: false
};

let keys = {};
let locked = false;
let running = false;
let lastTime = 0;
let toastTimer = 0;

const W_STEP = 0.25;
const W_LIMIT = 8;

const PLAYER_RADIUS = 0.32;
const PLAYER_HEIGHT = 1.7;

const materialCache = new Map();


// ============================================================
// MATERIALS
// ============================================================

function material(hex, opacity = 1, emissive = 0x000000) {
  const key = `${hex}-${opacity}-${emissive}`;

  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.78,
      metalness: 0.08,
      opacity,
      emissive,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide
    }));
  }

  return materialCache.get(key);
}


// ============================================================
// WORLD MANAGEMENT
// ============================================================

function clearWorld() {
  for (const obj of objects) {
    scene.remove(obj.mesh);

    if (obj.perceptionMesh && perceptionScene) {
      perceptionScene.remove(obj.perceptionMesh);

      obj.perceptionMesh.geometry.dispose();
      obj.perceptionMesh.material.dispose();
    }
  }

  objects = [];
  solids = [];
  goal = null;
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
    solid: spec.solid !== false
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
    color: spec.colour,
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
    isGoal
  };

  objects.push(item);

  if (item.solid && !isGoal) {
    solids.push(item);
  }

  if (isGoal) {
    goal = item;
  }
}


// ============================================================
// LEVEL LOADING
// ============================================================

function loadWorld(level) {
  clearWorld();

  currentLevel = level;

  for (const b of level.boxes) {
    addHyperBox(b);
  }

  if (level.goal) {
    addHyperBox(level.goal, true);
  }

  player = {
    ...player,

    x: level.spawn[0],
    y: level.spawn[1],
    z: level.spawn[2],
    w: level.spawn[3] ?? 0,

    vy: 0,
    onGround: false
  };

  camera.position.set(
    player.x,
    player.y + 1.55,
    player.z
  );

  camera.rotation.set(0, 0, 0);

  player.yaw = 0;
  player.pitch = 0;

  if ($('level-name')) {
    $('level-name').textContent = level.name.toUpperCase();
  }

  updatePos();
  updateSlice();
}


// ============================================================
// PLAYER POSITION
// ============================================================

function updatePos() {
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
 * A hyperbox intersects the XYZ slice when:
 *
 * W = player.w
 *
 * The second view:
 *
 * A hyperbox intersects the WXZ slice when:
 *
 * Y = player.y + PERCEPTION_EYE_HEIGHT
 */
function updateSlice() {
  for (const item of objects) {
    const wCenter = item.pos4[3];
    const halfW = item.size4[3] / 2;

    const distanceW = Math.abs(player.w - wCenter);

    if (distanceW <= halfW) {
      item.mesh.visible = true;

      if (item.mesh.material.transparent) {
        const factor = 1 - (distanceW / (halfW + 0.001));

        item.mesh.material.opacity = Math.max(0.2, factor);
      }
    } else {
      item.mesh.visible = false;
    }
  }

  // Update the second 3D slice too.
  updatePerceptionSlice();
}


// ============================================================
// W MOVEMENT
// ============================================================

function say(message) {
  if ($('toast')) {
    $('toast').textContent = message;
    toastTimer = 2.2;
  }
}

function changeW(amount) {
  const next = Math.max(
    -W_LIMIT,
    Math.min(
      W_LIMIT,
      Math.round((player.w + amount) * 100) / 100
    )
  );

  if (next === player.w) return;

  player.w = next;

  updateSlice();

  say(`W = ${player.w.toFixed(2)}`);
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

function collides(x, y, z) {
  return solids.some(
    o => o.mesh.visible && intersectsBox(x, y, z, o)
  );
}

function moveAxis(axis, amount) {
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
// GOAL
// ============================================================

function checkGoal() {
  if (!goal || !goal.mesh.visible) return;

  const p = goal.mesh.position;
  const s = goal.size4;

  if (
    Math.abs(player.x - p.x) < s[0] / 2 + 0.5 &&
    Math.abs(player.y - p.y) < s[1] / 2 + 1.0 &&
    Math.abs(player.z - p.z) < s[2] / 2 + 0.5
  ) {
    running = false;

    document.exitPointerLock?.();

    if ($('complete-title')) {
      $('complete-title').textContent = currentLevel.name;
    }

    if ($('complete-message')) {
      $('complete-message').textContent =
        currentLevel.completion ??
        'You found your way through the fourth dimension.';
    }

    if ($('next-button')) {
      $('next-button').style.display =
        currentIndex < levels.length - 1
          ? 'inline-block'
          : 'none';
    }

    showScreen('complete-screen');

    if ($('hud')) {
      $('hud').classList.add('hidden');
    }
  }
}


// ============================================================
// PLAYER UPDATE
// ============================================================

function update(dt) {
  if (!running) return;

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
    resetPlayer();
  }

  updatePerceptionSlice();

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

  checkGoal();

  if (toastTimer > 0) {
    toastTimer -= dt;

    if (toastTimer <= 0 && $('toast')) {
      $('toast').textContent = '';
    }
  }

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
}


// ============================================================
// LEVEL FETCHING
// ============================================================

async function fetchLevels() {
  try {
    const manifest = await fetch('./levels/manifest.json').then(r => {
      if (!r.ok) {
        throw Error('Could not load levels/manifest.json');
      }

      return r.json();
    });

    levels = await Promise.all(
      manifest.levels.map(async entry => {
        const data = await fetch(`./levels/${entry.file}`).then(r => {
          if (!r.ok) {
            throw Error(`Could not load ${entry.file}`);
          }

          return r.json();
        });

        return data;
      })
    );

  } catch (err) {
    console.warn(
      'Fallback to internal default 4D level array:',
      err.message
    );

    levels = DEFAULT_LEVELS;
  }

  if ($('loading')) {
    $('loading').classList.add('hidden');
  }

  renderLevelList();
}


// ============================================================
// LEVEL SELECTION
// ============================================================

function renderLevelList() {
  const levelList = $('level-list');

  if (!levelList) return;

  levelList.innerHTML = '';

  levels.forEach((level, i) => {
    const button = document.createElement('button');
    button.className = 'level-card';

    const strong = document.createElement('strong');
    strong.textContent = `LEVEL 0${i + 1}`;

    const name = document.createElement('span');
    name.textContent = level.name;

    const desc = document.createElement('small');
    desc.textContent =
      level.description ?? 'Explore this 4D slice of reality.';

    button.append(strong, name, desc);

    button.addEventListener('click', () => startLevel(i));

    levelList.append(button);
  });
}


// ============================================================
// GAME STATE
// ============================================================

function startLevel(index) {
  currentIndex = index;

  loadWorld(levels[index]);

  if ($('hud')) {
    $('hud').classList.remove('hidden');
  }

  showScreen(null);

  running = true;

  viewCanvas.requestPointerLock?.();
}

function pause() {
  if (!running) return;

  running = false;
  keys = {};

  if ($('pause-level')) {
    $('pause-level').textContent = currentLevel.name;
  }

  if ($('hud')) {
    $('hud').classList.add('hidden');
  }

  showScreen('pause-screen');
}

function resume() {
  showScreen(null);

  if ($('hud')) {
    $('hud').classList.remove('hidden');
  }

  running = true;

  viewCanvas.requestPointerLock?.();
}

function resetPlayer() {
  player.x = currentLevel.spawn[0];
  player.y = currentLevel.spawn[1];
  player.z = currentLevel.spawn[2];
  player.w = currentLevel.spawn[3] ?? 0;

  player.vy = 0;

  updateSlice();
}


// ============================================================
// UI BUTTONS
// ============================================================

if ($('start-button')) {
  $('start-button').onclick = () => startLevel(0);
}

if ($('levels-button')) {
  $('levels-button').onclick = () => showScreen('level-screen');
}

if ($('level-back')) {
  $('level-back').onclick = () => showScreen('title-screen');
}

if ($('resume-button')) {
  $('resume-button').onclick = resume;
}

if ($('pause-levels-button')) {
  $('pause-levels-button').onclick = () => {
    document.exitPointerLock?.();

    if ($('hud')) {
      $('hud').classList.add('hidden');
    }

    showScreen('level-screen');
  };
}

if ($('title-button')) {
  $('title-button').onclick = () => {
    document.exitPointerLock?.();

    if ($('hud')) {
      $('hud').classList.add('hidden');
    }

    showScreen('title-screen');
  };
}

if ($('complete-levels-button')) {
  $('complete-levels-button').onclick = () => {
    showScreen('level-screen');
  };
}

if ($('next-button')) {
  $('next-button').onclick = () => {
    startLevel(Math.min(currentIndex + 1, levels.length - 1));
  };
}


// ============================================================
// POINTER LOCK
// ============================================================

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === viewCanvas;

  if (!locked) {
    keys = {};

    if (running) {
      pause();
    }
  }
});

// Clear held keys if the browser loses focus.
window.addEventListener('blur', () => {
  keys = {};
});

document.addEventListener('mousemove', e => {
  if (!locked || !running) return;

  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;

  player.pitch = Math.max(
    -Math.PI / 2 + 0.03,
    Math.min(Math.PI / 2 - 0.03, player.pitch)
  );
});


// ============================================================
// W CONTROLS
// ============================================================

// Mouse wheel changes W.
document.addEventListener('wheel', e => {
  if (!running) return;

  e.preventDefault();

  const amount = e.deltaY < 0
    ? W_STEP
    : -W_STEP;

  changeW(amount);

}, { passive: false });

document.addEventListener('keydown', e => {
  keys[e.code] = true;

  if (
    e.code === 'Equal' ||
    e.code === 'NumpadAdd' ||
    e.code === 'KeyE'
  ) {
    e.preventDefault();
    changeW(W_STEP);
  }

  if (
    e.code === 'Minus' ||
    e.code === 'NumpadSubtract' ||
    e.code === 'KeyQ'
  ) {
    e.preventDefault();
    changeW(-W_STEP);
  }

  if (e.code === 'KeyR') {
    resetPlayer();
  }

  if (e.code === 'Escape' && running) {
    pause();
  }
});

document.addEventListener('keyup', e => {
  keys[e.code] = false;
});


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
});


// ============================================================
// INITIALISATION
// ============================================================

createPerceptionView();

requestAnimationFrame(animate);

fetchLevels();
