/**
 * ISC.exe — Page Transitions v2
 * Works with the updated repo (index, resource, timetable, landing).
 * NOT loaded by mobile.html (single-page app — no navigation).
 *
 * Drop in repo root. Add to end of <body> in:
 *   index.html, resource.html, timetable.html, landing.html
 *
 *   <script src="transitions.js"></script>
 *
 * Effect:
 *   EXIT  → dark overlay wipes IN from the right  (360ms)
 *   ENTER → dark overlay wipes OUT to the right   (480ms)
 *   Body  → subtle scale-down + blur on exit (GPU compositor only)
 */

(function () {
  'use strict';

  /* Skip entirely on mobile / touch-primary devices.
     mobile.html is a SPA with tab switching — transitions don't belong there. */
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;

  /* ── Timing ── */
  var DUR_OUT = 360;
  var DUR_IN  = 480;

  /* Read the page's bg and accent from CSS / localStorage */
  function getBg() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      return v || '#111210';
    } catch (e) { return '#111210'; }
  }
  function getAccent() {
    try { return localStorage.getItem('isc-accent') || '#7ab86a'; } catch (e) { return '#7ab86a'; }
  }

  /* ── Inject styles once ── */
  var style = document.createElement('style');
  style.textContent = [
    '#__pg-ov{',
      'position:fixed;inset:0;z-index:99998;',
      'pointer-events:none;',
      'will-change:clip-path;',
      'contain:strict;',
    '}',

    /* accent stripe rides the leading edge of the wipe */
    '#__pg-ov::after{',
      'content:"";',
      'position:absolute;inset:0;',
      'background:linear-gradient(',
        'to right,',
        'transparent 0%,',
        'var(--pg-a,#7ab86a) 49%,',
        'var(--pg-a,#7ab86a) 51%,',
        'transparent 100%',
      ');',
      'opacity:0;transition:opacity .08s;',
    '}',
    '#__pg-ov.stripe::after{opacity:.4;}',

    '@keyframes __pgWipeIn{',
      'from{clip-path:polygon(100% 0,100% 0,100% 100%,100% 100%)}',
      'to{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)}',
    '}',
    '@keyframes __pgWipeOut{',
      'from{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)}',
      'to{clip-path:polygon(100% 0,100% 0,100% 100%,100% 100%)}',
    '}',

    /* body exit: scale + blur, runs on compositor */
    '@keyframes __pgBodyExit{',
      'to{opacity:.45;transform:scale(.985) translateZ(0);filter:blur(1.5px)}',
    '}',
    'body.__pg-leaving{',
      'animation:__pgBodyExit ' + DUR_OUT + 'ms cubic-bezier(.4,0,.6,1) forwards;',
    '}'
  ].join('');
  document.head.appendChild(style);

  /* ── Create overlay element ── */
  var ov = document.createElement('div');
  ov.id = '__pg-ov';

  function syncColors() {
    ov.style.background = getBg();
    ov.style.setProperty('--pg-a', getAccent());
  }
  syncColors();

  /* Start fully hidden off the right edge */
  ov.style.clipPath = 'polygon(100% 0,100% 0,100% 100%,100% 100%)';
  document.body.appendChild(ov);

  /* ── ENTER animation: overlay already covering screen, wipes away ── */
  function playEnter() {
    syncColors();
    ov.style.animation = 'none';
    ov.style.clipPath   = 'polygon(0 0,100% 0,100% 100%,0 100%)'; /* covering */
    ov.classList.add('stripe');
    ov.getBoundingClientRect(); /* force reflow */
    ov.style.animation = '__pgWipeOut ' + DUR_IN + 'ms cubic-bezier(.77,0,.175,1) forwards';
    ov.addEventListener('animationend', function done() {
      ov.removeEventListener('animationend', done);
      ov.classList.remove('stripe');
      ov.style.clipPath = 'polygon(100% 0,100% 0,100% 100%,100% 100%)';
      ov.style.animation = 'none';
    });
  }

  /* ── EXIT animation: overlay wipes in, then browser navigates ── */
  var navigating = false;
  function navigate(href) {
    if (navigating) return;
    navigating = true;

    syncColors();
    ov.style.animation = 'none';
    ov.style.clipPath   = 'polygon(100% 0,100% 0,100% 100%,100% 100%)';
    ov.classList.add('stripe');
    ov.getBoundingClientRect();

    document.body.classList.add('__pg-leaving');
    ov.style.animation = '__pgWipeIn ' + DUR_OUT + 'ms cubic-bezier(.4,0,.6,1) forwards';

    setTimeout(function () { window.location.href = href; }, DUR_OUT - 40);
  }

  /* ── Intercept <a> clicks ── */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;

    var href = a.getAttribute('href');
    if (!href) return;

    /* Let through: external, hash-only, special protocols, download, new-tab */
    if (
      /^https?:\/\//i.test(href) ||
      href.indexOf('//') === 0    ||
      href.charAt(0) === '#'      ||
      /^(mailto|tel|javascript):/i.test(href) ||
      a.hasAttribute('download')  ||
      (a.target && a.target !== '_self' && a.target !== '')
    ) return;

    /* Let through: modifier-key combos (Ctrl/Cmd+click = new tab) */
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    navigate(href);

  }, true /* capture so we fire before inline onclick handlers */);

  /* ── Kick off enter animation ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(function () { requestAnimationFrame(playEnter); });
    });
  } else {
    requestAnimationFrame(function () { requestAnimationFrame(playEnter); });
  }

}());
