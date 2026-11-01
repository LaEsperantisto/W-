// Persistent user settings shared by the engine and the options screen.

const STORAGE_KEY = 'w_options';

export const DEFAULTS = {
  sensitivity: 1,
  invertY: false,
  fov: 75,
  overlay: 'perception', // 'perception' | 'views' | 'off'
  perceptionDrift: 3,
  wFade: true,
  quality: 'high', // 'off' | 'low' | 'high'
  wStep: 0.25
};

function clampSettings(s) {
  return {
    sensitivity: Math.min(3, Math.max(0.1, Number(s.sensitivity) || DEFAULTS.sensitivity)),
    invertY: !!s.invertY,
    fov: Math.min(110, Math.max(60, Number(s.fov) || DEFAULTS.fov)),
    overlay: ['perception', 'views', 'off'].includes(s.overlay) ? s.overlay : DEFAULTS.overlay,
    perceptionDrift: (s.perceptionDrift === undefined || s.perceptionDrift === null || Number.isNaN(Number(s.perceptionDrift))
      ? DEFAULTS.perceptionDrift
      : Math.min(8, Math.max(0, Number(s.perceptionDrift)))),
    wFade: !!s.wFade,
    quality: ['off', 'low', 'high'].includes(s.quality) ? s.quality : DEFAULTS.quality,
    wStep: [0.25, 0.5].includes(Number(s.wStep)) ? Number(s.wStep) : DEFAULTS.wStep
  };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    // Older builds stored a simple perception on/off switch.
    if (raw && typeof raw === 'object' && raw.overlay === undefined
        && typeof raw.showPerception === 'boolean') {
      raw.overlay = raw.showPerception ? 'perception' : 'off';
    }

    return clampSettings({ ...DEFAULTS, ...raw });
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();

export function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function setSetting(key, value) {
  Object.assign(settings, clampSettings({ ...settings, [key]: value }));
  saveSettings();
}

// Binds the markup in the #options-screen section to the settings object.
// onApply is invoked after every change so the engine can react live.
export function bindOptionsUI(onApply) {
  const $ = (id) => document.getElementById(id);

  const bind = (id, key, parse = (v) => v) => {
    const el = $(id);
    const out = $(id + '-value');
    if (!el) return null;

    const sync = () => {
      const raw = el.type === 'checkbox' ? el.checked : el.value;
      const value = parse(raw);
      setSetting(key, value);
      if (out) out.textContent = el.value;
      onApply();
    };

    if (el.type === 'checkbox') {
      el.checked = settings[key];
      el.onchange = sync;
    } else if (el.type === 'radio') {
      el.checked = settings[key] === el.value;
      el.onchange = sync;
    } else {
      el.value = settings[key];
      if (out) out.textContent = el.value;
      el.oninput = sync;
    }

    return el;
  };

  bind('opt-sensitivity', 'sensitivity', Number);
  bind('opt-fov', 'fov', Number);
  bind('opt-inverty', 'invertY', (v) => !!v);
  bind('opt-ov-perception', 'overlay', () => 'perception');
  bind('opt-ov-views', 'overlay', () => 'views');
  bind('opt-ov-off', 'overlay', () => 'off');
  bind('opt-drift', 'perceptionDrift', Number);
  bind('opt-wfade', 'wFade', (v) => !!v);
  bind('opt-q-off', 'quality', () => 'off');
  bind('opt-q-low', 'quality', () => 'low');
  bind('opt-q-high', 'quality', () => 'high');
  bind('opt-wstep-25', 'wStep', () => 0.25);
  bind('opt-wstep-50', 'wStep', () => 0.5);

  const reset = $('opt-reset');
  if (reset) {
    reset.onclick = () => {
      Object.assign(settings, { ...DEFAULTS });
      saveSettings();
      bindOptionsUI(onApply); // re-sync all inputs to defaults
      onApply();
    };
  }
}
