import { settings, bindOptionsUI } from './options.js';
import * as engine from './engine.js';
import * as world from './world.js';

const $ = (id) => document.getElementById(id);

const screens = [
  'title-screen',
  'level-screen',
  'pause-screen',
  'complete-screen',
  'options-screen',
  'story-screen',
  'world-screen'
];

const showScreen = (id) => screens.forEach(s => {
  const el = $(s);
  if (el) el.classList.toggle('hidden', s !== id);
});

const viewCanvas = $('view');

let locked = false;
let mode = 'level'; // 'level' | 'story' | 'world'
let optionsReturn = 'title-screen';

// ============================================================
// LEVEL MODE
// ============================================================

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

function renderLevelList() {
  const levelList = $('level-list');

  if (!levelList) return;

  levelList.innerHTML = '';

  levels.forEach((level, i) => {
    const button = document.createElement('button');
    button.className = 'level-card';

    const strong = document.createElement('strong');
    strong.textContent = `LEVEL ${String(i + 1).padStart(2, '0')}`;

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

function levelComplete(level) {
  if ($('complete-title')) {
    $('complete-title').textContent = level.name;
  }

  if ($('complete-message')) {
    $('complete-message').textContent =
      level.completion ??
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

function startLevel(index) {
  currentIndex = index;
  mode = 'level';

  engine.setCollider(null);
  engine.setFrameHandler(null);
  engine.setGoalHandler(levelComplete);
  engine.loadWorld(levels[index]);

  if ($('hud')) {
    $('hud').classList.remove('hidden');
  }

  showScreen(null);

  engine.setRunning(true);

  viewCanvas.requestPointerLock?.();
}

// ============================================================
// STORY MODE
// ============================================================

let storyData = null;
let storyIndex = Number(localStorage.getItem('w_story_progress') || 0);

async function loadStory() {
  if (storyData) return true;

  try {
    const manifest = await fetch('./story/chapters.json').then(r => {
      if (!r.ok) {
        throw Error('Could not load story/chapters.json');
      }

      return r.json();
    });

    const chapters = await Promise.all(
      manifest.chapters.map(async entry => {
        const data = await fetch(`./story/${entry.file}`).then(r => {
          if (!r.ok) {
            throw Error(`Could not load story/${entry.file}`);
          }

          return r.json();
        });

        return data;
      })
    );

    const prose = await fetch('./prose/story.json').then(r => {
      if (!r.ok) {
        throw Error('Could not load prose/story.json');
      }

      return r.json();
    });

    storyData = { chapters, prose };

    return true;
  } catch (err) {
    console.warn('Story mode unavailable:', err.message);
    return false;
  }
}

function showStoryText(eyebrow, title, paragraphs, buttonLabel, onNext) {
  const box = $('story-text');

  $('story-eyebrow').textContent = eyebrow;
  $('story-title').textContent = title;

  box.innerHTML = '';

  for (const p of paragraphs) {
    const el = document.createElement('p');
    el.textContent = p;
    box.append(el);
  }

  const button = $('story-continue');
  button.textContent = buttonLabel;
  button.onclick = onNext;

  $('story-abandon').onclick = returnToTitle;

  showScreen('story-screen');
}

function runStoryChapter(i) {
  const { chapters, prose } = storyData;

  if (i >= chapters.length) {
    showStoryText(
      prose.title ?? 'The Long Way Home',
      'Epilogue',
      prose.epilogue,
      'RETURN TO TITLE',
      returnToTitle
    );

    return;
  }

  const chapter = chapters[i];
  const key = `ch${String(i + 1).padStart(2, '0')}`;
  const before = prose.chapters?.[key]?.before ?? [];

  showStoryText(
    `${prose.title ?? 'The Long Way Home'} — Chapter ${i + 1}`,
    chapter.name,
    before,
    'BEGIN',
    () => startStoryChapter(i)
  );
}

function startStoryChapter(i) {
  const { chapters, prose } = storyData;
  const chapter = chapters[i];
  const key = `ch${String(i + 1).padStart(2, '0')}`;

  storyIndex = i;
  localStorage.setItem('w_story_progress', String(i));

  mode = 'story';

  engine.setCollider(null);
  engine.setFrameHandler(null);
  engine.setGoalHandler(() => {
    localStorage.setItem('w_story_progress', String(i + 1));
    storyIndex = i + 1;
    updateStoryButton();

    const after = prose.chapters?.[key]?.after ??
      [chapter.completion ?? 'You press onward.'];

    showStoryText(
      `${prose.title ?? 'The Long Way Home'} — Chapter ${i + 1}`,
      chapter.name,
      after,
      i + 1 < chapters.length ? 'NEXT CHAPTER' : 'EPILOGUE',
      () => runStoryChapter(i + 1)
    );

    if ($('hud')) {
      $('hud').classList.add('hidden');
    }
  });

  engine.loadWorld(chapter);

  if ($('hud')) {
    $('hud').classList.remove('hidden');
  }

  showScreen(null);

  engine.setRunning(true);

  viewCanvas.requestPointerLock?.();
}

async function enterStory() {
  if (!(await loadStory())) {
    showScreen('title-screen');
    return;
  }

  if (storyIndex >= storyData.chapters.length) {
    storyIndex = 0; // finished once: replay from the start
  }

  if (storyIndex === 0 && storyData.prose.intro?.length) {
    showStoryText(
      storyData.prose.title ?? 'The Long Way Home',
      'The Long Way Home',
      storyData.prose.intro,
      'BEGIN',
      () => runStoryChapter(0)
    );

    return;
  }

  runStoryChapter(storyIndex);
}

function updateStoryButton() {
  const button = $('story-button');
  if (!button) return;

  const saved = Number(localStorage.getItem('w_story_progress') || 0);

  button.textContent = saved > 0 ? 'CONTINUE STORY' : 'STORY MODE';
}

// ============================================================
// OPEN WORLD MODE
// ============================================================

function randomSeed() {
  const words = ['ridge', 'halvorsen', 'vessel', 'fold', 'meadow', 'undercroft', 'lantern', 'hollow', 'meridian', 'tessellate'];
  return words[Math.floor(Math.random() * words.length)] + '-' + Math.floor(Math.random() * 9000 + 1000);
}

function openWorldScreen() {
  const input = $('w-seed');

  input.value = localStorage.getItem('w_last_seed') || '';
  input.placeholder = randomSeed();

  showScreen('world-screen');
}

function generateWorld() {
  const input = $('w-seed');
  const seed = (input.value || '').trim() || input.placeholder;

  localStorage.setItem('w_last_seed', seed);

  mode = 'world';

  engine.setGoalHandler(null);

  world.enterWorld(seed);
}

// ============================================================
// GAME STATE
// ============================================================

function pauseGame() {
  if (!engine.getRunning()) return;

  engine.setRunning(false);
  engine.clearKeys();

  if ($('pause-level')) {
    $('pause-level').textContent = engine.getCurrentLevel()?.name ?? '';
  }

  if ($('hud')) {
    $('hud').classList.add('hidden');
  }

  $('pause-levels-button').style.display =
    mode === 'level' ? 'inline-block' : 'none';

  showScreen('pause-screen');
}

function resumeGame() {
  showScreen(null);

  if ($('hud')) {
    $('hud').classList.remove('hidden');
  }

  engine.setRunning(true);

  viewCanvas.requestPointerLock?.();
}

function returnToTitle() {
  engine.setRunning(false);
  engine.clearKeys();
  engine.setGoalHandler(null);

  if (mode === 'world') {
    world.exitWorld();
    mode = 'level';
  }

  document.exitPointerLock?.();

  if ($('hud')) {
    $('hud').classList.add('hidden');
  }

  updateStoryButton();

  showScreen('title-screen');
}

function openOptions(returnScreen) {
  optionsReturn = returnScreen;
  showScreen('options-screen');
}

// ============================================================
// UI BUTTONS
// ============================================================

$('levels-button').onclick = () => showScreen('level-screen');
$('story-button').onclick = enterStory;
$('open-world-button').onclick = openWorldScreen;
$('options-button').onclick = () => openOptions('title-screen');

$('level-back').onclick = () => showScreen('title-screen');
$('world-back').onclick = () => showScreen('title-screen');
$('w-generate').onclick = generateWorld;

$('resume-button').onclick = resumeGame;
$('pause-options-button').onclick = () => openOptions('pause-screen');

$('pause-levels-button').onclick = () => {
  document.exitPointerLock?.();
  showScreen('level-screen');
};

$('title-button').onclick = returnToTitle;

$('opt-back').onclick = () => showScreen(optionsReturn);

$('next-button').onclick = () => {
  startLevel(Math.min(currentIndex + 1, levels.length - 1));
};

$('complete-levels-button').onclick = () => {
  showScreen('level-screen');
};

// ============================================================
// POINTER LOCK + INPUT
// ============================================================

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === viewCanvas;

  if (!locked) {
    engine.clearKeys();

    if (engine.getRunning()) {
      pauseGame();
    }
  }
});

window.addEventListener('blur', () => {
  engine.clearKeys();
});

document.addEventListener('mousemove', e => {
  if (!locked || !engine.getRunning()) return;

  engine.look(e.movementX, e.movementY);
});

document.addEventListener('wheel', e => {
  if (!engine.getRunning()) return;

  e.preventDefault();

  engine.changeW((e.deltaY < 0 ? 1 : -1) * settings.wStep);

}, { passive: false });

document.addEventListener('keydown', e => {
  engine.setKey(e.code, true);

  if (
    e.code === 'Equal' ||
    e.code === 'NumpadAdd' ||
    e.code === 'KeyE'
  ) {
    e.preventDefault();
    engine.changeW(settings.wStep);
  }

  if (
    e.code === 'Minus' ||
    e.code === 'NumpadSubtract' ||
    e.code === 'KeyQ'
  ) {
    e.preventDefault();
    engine.changeW(-settings.wStep);
  }

  if (e.code === 'KeyR' && mode !== 'world') {
    const spawn = engine.getCurrentLevel()?.spawn;

    if (spawn) {
      engine.respawnTo(spawn);
    }
  }

  if (e.code === 'Escape' && engine.getRunning()) {
    pauseGame();
  }
});

document.addEventListener('keyup', e => {
  engine.setKey(e.code, false);
});

// ============================================================
// INITIALISATION
// ============================================================

// Debug/test handle: lets the console inspect live engine state.
window.W = { engine, world, settings };

bindOptionsUI(engine.applyOptions);
world.init({ showScreen });
updateStoryButton();
showScreen('title-screen');

fetchLevels();
