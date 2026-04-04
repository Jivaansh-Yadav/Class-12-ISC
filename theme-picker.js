/**
 * ISC.exe — Shared Theme Picker Logic
 * =====================================
 * Drop this AFTER theme-color-system.js on any page.
 * Handles the picker UI, preset swatches, gradient selection,
 * localStorage persistence, and delegates all color math to ISCTheme.
 *
 * Requires: theme-color-system.js (window.ISCTheme)
 * Requires DOM: #pickerWrap, #pickerPanel, #colorTrigger, #triggerSwatch,
 *               #presetsGrid, #gradPresetsGrid, #hexInput, #nativePicker,
 *               #pmtSolid, #pmtGrad, (optional) #autosaveDot
 */

(function () {
  'use strict';

  // ─── CONSTANTS ───────────────────────────────────────────────────────────────

  const STORE_KEY = 'isc-accent';
  const GRAD_KEY  = 'isc-gradient';

  // Default accent per page (falls back to this if nothing saved)
  const DEFAULT_ACCENT = '#3bff6c';

  const SOLID_PRESETS = [
    { name: 'Matrix Green',   hex: '#3bff6c' },
    { name: 'Sage',           hex: '#7ab86a' },
    { name: 'Neon Lime',      hex: '#a8ff3e' },
    { name: 'Mint',           hex: '#5fffa0' },
    { name: 'Electric Cyan',  hex: '#00e5ff' },
    { name: 'Sky Blue',       hex: '#48aff7' },
    { name: 'Royal Indigo',   hex: '#7c6fff' },
    { name: 'Violet',         hex: '#bf5fff' },
    { name: 'Hot Pink',       hex: '#ff5fa0' },
    { name: 'Crimson',        hex: '#ff4f4f' },
    { name: 'Amber',          hex: '#ffbe3f' },
    { name: 'Gold',           hex: '#f5c842' },
    { name: 'Coral',          hex: '#ff7a5a' },
    { name: 'Teal',           hex: '#3ecfb0' },
    { name: 'Lavender',       hex: '#a07fe8' },
  ];

  const GRADIENT_PRESETS = [
    { name: 'Aurora',     a: '#7af5a0', b: '#5fd4e8' },
    { name: 'Neon Dusk',  a: '#bf5fff', b: '#ff5fa0' },
    { name: 'Sunset',     a: '#ff7a5a', b: '#ffbe3f' },
    { name: 'Ocean',      a: '#5fd4e8', b: '#48aff7' },
    { name: 'Galaxy',     a: '#7c6fff', b: '#bf5fff' },
    { name: 'Jade',       a: '#3ecfb0', b: '#7ab86a' },
    { name: 'Lava',       a: '#ff4f4f', b: '#bf5fff' },
    { name: 'Gold Rush',  a: '#f5c842', b: '#ff7a5a' },
    { name: 'Cosmic',     a: '#7c6fff', b: '#ff5fa0' },
    { name: 'Rose Gold',  a: '#ff5fa0', b: '#ffbe3f' },
  ];

  // ─── STATE ───────────────────────────────────────────────────────────────────

  let pickerOpen   = false;
  let pickerMode   = 'solid'; // 'solid' | 'gradient'
  let currentGrad  = null;
  let currentHex   = localStorage.getItem(STORE_KEY) || DEFAULT_ACCENT;

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  const $ = id => document.getElementById(id);

  function closePicker() {
    pickerOpen = false;
    $('pickerPanel')?.classList.remove('open');
    $('colorTrigger')?.classList.remove('open');
  }

  function openPicker() {
    pickerOpen = true;
    buildPresets();
    buildGradPresets();
    $('pickerPanel')?.classList.add('open');
    $('colorTrigger')?.classList.add('open');
  }

  function togglePicker() {
    pickerOpen ? closePicker() : openPicker();
  }

  // ─── APPLY SOLID ACCENT ──────────────────────────────────────────────────────

  function applyAccent(hex, save = true) {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;

    currentHex  = hex;
    currentGrad = null;
    document.body.classList.remove('grad-mode');

    // Delegate all color math to the smart system
    window.ISCTheme.apply(hex);

    // Persist
    if (save) {
      localStorage.setItem(STORE_KEY, hex);
      localStorage.removeItem(GRAD_KEY);
    }

    // Update hex input fields
    const hexInput = $('hexInput');
    if (hexInput) hexInput.value = hex.toUpperCase();
    const nativePicker = $('nativePicker');
    if (nativePicker) nativePicker.value = hex;

    // Refresh swatch active states
    _refreshPresetActiveStates(hex, null);
  }

  // ─── APPLY GRADIENT ──────────────────────────────────────────────────────────

  function applyGradient(a, b, save = true) {
    currentGrad = { a, b };
    document.body.classList.add('grad-mode');

    window.ISCTheme.applyGradient(a, b);

    if (save) {
      localStorage.setItem(GRAD_KEY, JSON.stringify({ a, b }));
      localStorage.setItem(STORE_KEY, a);
    }

    _refreshPresetActiveStates(null, { a, b });
  }

  // ─── RESET ───────────────────────────────────────────────────────────────────

  function resetAccent() {
    currentGrad = null;
    document.body.classList.remove('grad-mode');
    localStorage.removeItem(GRAD_KEY);
    applyAccent(DEFAULT_ACCENT, true);
    switchPickerMode('solid');
  }

  // ─── PICKER MODE ─────────────────────────────────────────────────────────────

  function switchPickerMode(mode) {
    pickerMode = mode;
    const solidPanel = $('solidPanel');
    const gradPanel  = $('gradPanel');
    const pmtSolid   = $('pmtSolid');
    const pmtGrad    = $('pmtGrad');
    if (solidPanel) solidPanel.style.display = mode === 'solid' ? '' : 'none';
    if (gradPanel)  gradPanel.style.display  = mode === 'gradient' ? '' : 'none';
    pmtSolid?.classList.toggle('active', mode === 'solid');
    pmtGrad?.classList.toggle('active',  mode === 'gradient');
  }

  // ─── BUILD PRESET GRIDS ──────────────────────────────────────────────────────

  function buildPresets() {
    const grid = $('presetsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    SOLID_PRESETS.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'preset';
      btn.style.background  = p.hex;
      btn.style.boxShadow   = `0 2px 10px ${p.hex}55`;
      btn.title = p.name;
      btn.dataset.hex = p.hex;

      if (!currentGrad && p.hex.toLowerCase() === currentHex.toLowerCase()) {
        btn.classList.add('active');
      }

      btn.onclick = () => { applyAccent(p.hex); closePicker(); };
      grid.appendChild(btn);
    });
  }

  function buildGradPresets() {
    const grid = $('gradPresetsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    GRADIENT_PRESETS.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'grad-preset';
      btn.style.background = `linear-gradient(135deg, ${g.a}, ${g.b})`;
      btn.style.boxShadow  = `0 2px 10px ${g.a}55`;
      btn.dataset.a = g.a;
      btn.dataset.b = g.b;
      btn.title = g.name;

      if (currentGrad && currentGrad.a === g.a && currentGrad.b === g.b) {
        btn.classList.add('active');
      }

      btn.onclick = () => { applyGradient(g.a, g.b); closePicker(); };
      grid.appendChild(btn);
    });
  }

  function _refreshPresetActiveStates(hex, grad) {
    document.querySelectorAll('.preset').forEach(el => {
      el.classList.toggle('active', !grad && !!hex && el.dataset.hex?.toLowerCase() === hex.toLowerCase());
    });
    document.querySelectorAll('.grad-preset').forEach(el => {
      el.classList.toggle('active', !!grad && el.dataset.a === grad.a && el.dataset.b === grad.b);
    });
  }

  // ─── HEX INPUT APPLY ─────────────────────────────────────────────────────────

  function applyHex() {
    const inp = $('hexInput');
    if (!inp) return;
    let v = inp.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
      inp.classList.add('err');
      return;
    }
    inp.classList.remove('err');
    const native = $('nativePicker');
    if (native) native.value = v;
    applyAccent(v);
    closePicker();
  }

  // ─── INIT ────────────────────────────────────────────────────────────────────

  function init() {
    // Close picker on outside click
    document.addEventListener('click', e => {
      if (pickerOpen) {
        const wrap = $('pickerWrap');
        if (wrap && !wrap.contains(e.target)) closePicker();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && pickerOpen) closePicker();
    });

    // Native color wheel
    const native = $('nativePicker');
    if (native) {
      native.value = currentHex;
      native.addEventListener('input', e => {
        const v = e.target.value;
        const hi = $('hexInput');
        if (hi) hi.value = v.toUpperCase();
        applyAccent(v);
      });
    }

    // Hex input enter
    const hexInput = $('hexInput');
    if (hexInput) {
      hexInput.value = currentHex.toUpperCase();
      hexInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyHex(); });
    }

    // Restore saved theme
    const savedGrad = localStorage.getItem(GRAD_KEY);
    if (savedGrad) {
      try {
        const g = JSON.parse(savedGrad);
        if (g.a && g.b) {
          currentGrad = g;
          applyGradient(g.a, g.b, false);
          switchPickerMode('gradient');
          return;
        }
      } catch (_) { /* ignore */ }
    }

    const savedAccent = localStorage.getItem(STORE_KEY);
    if (savedAccent && /^#[0-9a-fA-F]{6}$/.test(savedAccent)) {
      currentHex = savedAccent;
      applyAccent(savedAccent, false);
    } else {
      applyAccent(DEFAULT_ACCENT, false);
    }
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────────

  window.ISCPicker = {
    toggle: togglePicker,
    close:  closePicker,
    applyAccent,
    applyGradient,
    resetAccent,
    switchPickerMode,
    applyHex,
    buildPresets,
    buildGradPresets,
  };

  // Expose individual functions globally so existing onclick="" attrs still work
  window.togglePicker    = togglePicker;
  window.closePicker     = closePicker;
  window.applyHex        = applyHex;
  window.resetAccent     = resetAccent;
  window.switchPickerMode = switchPickerMode;

  // Boot after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
