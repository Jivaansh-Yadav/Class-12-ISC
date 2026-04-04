/**
 * ISC.exe — Smart Accent Color System
 * =====================================
 * Automatically derives readable, accessible UI colors from ANY accent color.
 * Computes luminance and generates a full set of safe derived tokens so that
 * the chrome (text, borders, glows) is always legible regardless of the accent
 * hue chosen by the user.
 *
 * USAGE: Drop this script into any page. It reads `isc-accent` and
 * `isc-gradient` from localStorage, then calls `applySmartAccent(hex)`.
 * It also patches window so pages can call window.ISCTheme.apply(hex).
 *
 * CSS variables written to :root
 * ─────────────────────────────
 *  --accent            raw accent hex (unchanged)
 *  --accent-lo         accent at ~9% alpha (safe tint for backgrounds)
 *  --accent-md         accent at ~18% alpha (hover states, borders)
 *  --accent-hi         accent at ~35% alpha (strong glows, active rings)
 *  --accent-text       readable text ON top of a dark background using this accent
 *                      → if accent is very dark, this is lightened; if very light, kept as-is
 *  --accent-on         color to use ON TOP of a solid accent background
 *                      → black (#000) for light accents, white (#fff) for dark ones
 *  --accent-border     border color — desaturated/dimmed version that never looks garish
 *  --accent-glow       box-shadow glow color (semi-transparent, always safe)
 *  --accent-subtle     extremely faint tint for card backgrounds (2–4% alpha)
 *  --accent-nav        color for nav elements — always has ≥4.5:1 contrast on --bg
 *  --grad-a / --grad-b gradient endpoints (same as before)
 */

(function () {
  'use strict';

  // ─── MATH HELPERS ────────────────────────────────────────────────────────────

  /** Parse "#rrggbb" → [r, g, b] (0–255) */
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  /** [r,g,b] (0–255) → "#rrggbb" */
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v =>
      Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
    ).join('');
  }

  /** Relative luminance per WCAG 2.1 (0 = black, 1 = white) */
  function luminance(r, g, b) {
    const [R, G, B] = [r, g, b].map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }

  /** WCAG contrast ratio between two [r,g,b] triplets */
  function contrast(rgb1, rgb2) {
    const l1 = luminance(...rgb1);
    const l2 = luminance(...rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Lighten or darken [r,g,b] by `amount` (−1 to +1).
   * Positive = lighter, negative = darker.
   */
  function adjustLightness(rgb, amount) {
    return rgb.map(c => Math.max(0, Math.min(255, c + amount * 255)));
  }

  /**
   * Mix `rgb` toward a target `toward` (0–1 for each channel) by `t` (0–1).
   */
  function mix(rgb, toward, t) {
    return rgb.map((c, i) => c * (1 - t) + toward[i] * t);
  }

  /** Desaturate [r,g,b] by factor t (0=none, 1=full grayscale) */
  function desaturate(rgb, t) {
    const gray = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
    return rgb.map(c => c + (gray - c) * t);
  }

  /** rgba() string from [r,g,b] and alpha */
  function rgba(rgb, alpha) {
    return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${alpha})`;
  }

  // ─── DARK BACKGROUND ASSUMPTION ─────────────────────────────────────────────
  // ISC.exe is fundamentally a dark-theme product. The background is assumed to
  // be around luminance 0.02–0.07 (#0f1318 range).  All "safe text" calculations
  // target contrast against this dark surface.

  const ASSUMED_BG_LUM = 0.025; // ~#131921

  /**
   * Given an accent hex, compute a "safe text" version that:
   * - Has ≥ 4.5:1 contrast against the assumed dark background
   * - Is as close to the original hue as possible
   * - Never looks washed out or neon-blinding
   */
  function makeSafeTextColor(rgb) {
    const lum = luminance(...rgb);
    // Contrast of this color on the dark BG
    const c = (lum + 0.05) / (ASSUMED_BG_LUM + 0.05);

    if (c >= 4.5) {
      // Already contrast-safe — use as-is (slightly toned down if extremely bright)
      if (lum > 0.85) {
        // Near-white: desaturate slightly so it doesn't feel sterile
        const desat = desaturate(rgb, 0.15);
        return rgbToHex(...desat.map(Math.round));
      }
      return rgbToHex(...rgb.map(Math.round));
    }

    // Not enough contrast — lighten iteratively
    let adjusted = [...rgb];
    for (let step = 0; step < 30; step++) {
      adjusted = adjustLightness(adjusted, 0.04);
      const adjLum = luminance(...adjusted);
      const adjC = (adjLum + 0.05) / (ASSUMED_BG_LUM + 0.05);
      if (adjC >= 4.5) break;
    }
    return rgbToHex(...adjusted.map(Math.round));
  }

  /**
   * Compute color to use ON TOP of a solid accent-colored button/badge.
   * Returns "#000" or "#fff" based on which has better contrast.
   */
  function colorOnAccent(rgb) {
    const lum = luminance(...rgb);
    const onBlack = (lum + 0.05) / 0.05; // contrast vs black
    const onWhite = 1.05 / (lum + 0.05); // contrast vs white
    return onBlack > onWhite ? '#000' : '#fff';
  }

  /**
   * Create a border color: desaturated, dimmed version of the accent.
   * Always reads as a subtle structural line, never garish.
   */
  function makeBorderColor(rgb, alpha = 0.28) {
    const desat = desaturate(rgb, 0.35);
    return rgba(desat, alpha);
  }

  /**
   * Main entry: given accent hex, compute and set all CSS variables.
   */
  function applySmartAccent(hex, gradA, gradB) {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;

    const rgb = hexToRgb(hex);
    const root = document.documentElement;

    // ── Core accent ──
    root.style.setProperty('--accent', hex);

    // ── Alpha variants ──
    root.style.setProperty('--accent-lo',     rgba(rgb, 0.09));
    root.style.setProperty('--accent-md',     rgba(rgb, 0.18));
    root.style.setProperty('--accent-hi',     rgba(rgb, 0.35));
    root.style.setProperty('--accent-subtle', rgba(rgb, 0.03));

    // ── Safe text color (readable on dark bg) ──
    const safeText = makeSafeTextColor(rgb);
    root.style.setProperty('--accent-text', safeText);

    // ── Color on solid accent background ──
    const onAccent = colorOnAccent(rgb);
    root.style.setProperty('--accent-on', onAccent);

    // ── Border color ──
    root.style.setProperty('--accent-border', makeBorderColor(rgb, 0.28));

    // ── Glow ──
    root.style.setProperty('--accent-glow', rgba(rgb, 0.22));

    // ── Nav text: same as safe text but slightly more muted ──
    const navRgb = hexToRgb(safeText);
    const navMuted = mix(navRgb, hexToRgb(safeText), 0.85);
    root.style.setProperty('--accent-nav', rgbToHex(...navMuted.map(Math.round)));

    // ── Gradient vars ──
    if (gradA) root.style.setProperty('--grad-a', gradA);
    else root.style.setProperty('--grad-a', hex);
    if (gradB) root.style.setProperty('--grad-b', gradB);
    else root.style.setProperty('--grad-b', hex);

    // ── Update visual elements on the page ──
    _updatePageElements(hex, safeText, onAccent, rgb);
  }

  /**
   * Refresh common page chrome elements that reference the accent.
   * Works across resource.html, index.html, timetable.html, etc.
   */
  function _updatePageElements(hex, safeText, onAccent, rgb) {
    // Nav brand dot
    const mark = document.getElementById('navMark');
    if (mark) { mark.style.background = hex; mark.style.boxShadow = `0 0 10px ${hex}`; }

    // Theme picker swatch
    const swatch = document.getElementById('triggerSwatch');
    if (swatch) { swatch.style.background = hex; swatch.style.boxShadow = `0 0 6px ${hex}`; }

    // Autosave dot
    const adot = document.getElementById('autosaveDot');
    if (adot) adot.style.background = hex;

    // Picker panel top border
    const panel = document.getElementById('pickerPanel');
    if (panel) panel.style.borderTopColor = hex;

    // Apply btn
    const applyBtn = document.querySelector('.apply-btn');
    if (applyBtn) { applyBtn.style.background = hex; applyBtn.style.color = onAccent; }

    // Loader spinner
    const spinner = document.querySelector('.loader-spinner');
    if (spinner) spinner.style.borderTopColor = hex;

    // Nav pip dots
    document.querySelectorAll('.nav-link-pip').forEach(pip => {
      pip.style.background = hex;
      pip.style.boxShadow = `0 0 6px ${hex}`;
    });

    // Stream footer dot
    const footerDot = document.querySelector('.sd-footer-dot');
    if (footerDot) { footerDot.style.background = hex; footerDot.style.boxShadow = `0 0 6px ${hex}`; }

    // Sidebar sys dot
    const sysDot = document.querySelector('.sys-status-dot');
    if (sysDot) { sysDot.style.background = hex; sysDot.style.boxShadow = `0 0 6px ${hex}`; }

    // Eyebrow lines on landing page
    document.querySelectorAll('.eyebrow-line').forEach(l => l.style.background = hex);
    const eyeEm = document.getElementById('eyeEm');
    if (eyeEm) { eyeEm.style.color = hex; }

    // Hero subtitle text color (landing)
    const heroSub = document.getElementById('heroSub');
    if (heroSub) { heroSub.style.color = safeText; }

    // Timetable ticker
    const ticker = document.getElementById('tickerTime');
    if (ticker) ticker.style.color = safeText;
  }

  /**
   * Apply a gradient pair.  The accent is set to `a` (first stop).
   */
  function applySmartGradient(a, b) {
    if (!a || !b) return;
    applySmartAccent(a, a, b);

    // Gradient-mode class
    document.body.classList.add('grad-mode');

    // Override swatch to show gradient
    const swatch = document.getElementById('triggerSwatch');
    if (swatch) {
      swatch.style.background = `linear-gradient(135deg, ${a}, ${b})`;
      swatch.style.boxShadow = `0 0 6px ${a}`;
    }

    const mark = document.getElementById('navMark');
    if (mark) {
      mark.style.background = `linear-gradient(135deg, ${a}, ${b})`;
      mark.style.boxShadow = `0 0 10px ${a}`;
    }
  }

  /**
   * Bootstrap: read saved theme from localStorage and apply it.
   * Call this once on DOMContentLoaded (or immediately if DOM is ready).
   */
  function bootstrap() {
    const savedGrad = localStorage.getItem('isc-gradient');
    const savedAccent = localStorage.getItem('isc-accent');

    if (savedGrad) {
      try {
        const g = JSON.parse(savedGrad);
        if (g.a && g.b) {
          applySmartGradient(g.a, g.b);
          return;
        }
      } catch (e) { /* ignore */ }
    }

    if (savedAccent && /^#[0-9a-fA-F]{6}$/.test(savedAccent)) {
      document.body.classList.remove('grad-mode');
      applySmartAccent(savedAccent);
    }
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────────

  window.ISCTheme = {
    apply: applySmartAccent,
    applyGradient: applySmartGradient,
    bootstrap,
    // Expose helpers for pages that need them
    utils: { hexToRgb, rgbToHex, luminance, contrast, rgba, makeSafeTextColor, colorOnAccent },
  };

  // Auto-bootstrap on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
