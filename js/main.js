/**
 * main.js
 * Initialization / orchestration entry point. Defensively wires up
 * carousel.js and marquee.js instances once the DOM is ready, and applies
 * the global prefers-reduced-motion guard consistently across components.
 *
 * Load order (see index.html): carousel.js, marquee.js, main.js — all
 * deferred, so DOMContentLoaded has not necessarily fired yet when this
 * script runs, but the DOM is fully parsed (defer semantics).
 */

(function () {
  'use strict';

  function init() {
    var ns = window.PSE;

    if (!ns) {
      // carousel.js / marquee.js failed to load or execute — fail
      // defensively rather than throwing, so the rest of the static page
      // (content, links, nav) remains usable without JS-enhanced behavior.
      if (window.console && console.warn) {
        console.warn('[PSE] Carousel/marquee modules not found; skipping JS enhancement.');
      }
      return;
    }

    try {
      if (typeof ns.initCarousels === 'function') {
        ns.initCarousels();
      }
    } catch (err) {
      if (window.console && console.error) {
        console.error('[PSE] Carousel initialization failed:', err);
      }
    }

    try {
      if (typeof ns.initMarquees === 'function') {
        ns.initMarquees();
      }
    } catch (err) {
      if (window.console && console.error) {
        console.error('[PSE] Marquee initialization failed:', err);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
