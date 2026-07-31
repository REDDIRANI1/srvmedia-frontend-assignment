/**
 * marquee.js
 * Continuous "sling" marquee for Participating School Logos.
 * Kept separate from carousel.js (see IMPLEMENTATION_PLAN.md §7): this is a
 * continuously-scrolling, non-paginated loop with clone-based seamless
 * wrapping, not a discrete slide-index carousel.
 *
 * Two rows, opposite directions:
 *   - Each [data-marquee] instance reads data-marquee-direction
 *     ("left" | "right") and gets a matching `marquee--left` /
 *     `marquee--right` root class (see components.css, which pairs each
 *     with its own @keyframes so the two rows scroll in opposite
 *     directions). Exactly two rows are used on this page, one per
 *     direction, per IMPLEMENTATION_PLAN.md §5.2.
 *   - One shared, persistent, visible pause/play control
 *     ([data-marquee-playpause-all]) pauses/resumes both rows together —
 *     a defensible simplification of "share a visible pause/play control
 *     or have clearly labelled individual controls" (both rows are one
 *     continuous decorative element with identical semantics, so a single
 *     shared control avoids doubling up near-identical buttons).
 *
 * Per-instance behavior:
 *   - Duplicates the logo list once so the CSS/JS scroll loop is seamless.
 *     The clone is marked aria-hidden="true" and every element inside it is
 *     stripped of interactivity (tabindex="-1", removed from tab order) —
 *     see IMPLEMENTATION_PLAN.md §6.3.
 *   - Pauses on hover AND keyboard focus (not hover-only), per-row.
 *   - Respects prefers-reduced-motion (animation removed entirely).
 *
 * Implementation: CSS animation-driven translation, toggled via an
 * `is-paused` class so CSS controls the actual motion and JS only
 * manages state/ARIA.
 */

(function () {
  'use strict';

  function Marquee(root) {
    this.root = root;
    this.track = root.querySelector('[data-marquee-track]');
    this.content = root.querySelector('[data-marquee-content]');
    this.cloneContainer = root.querySelector('[data-marquee-clone]');
    this.direction = root.dataset.marqueeDirection === 'right' ? 'right' : 'left';

    this.isPaused = false;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.init();
  }

  Marquee.prototype.init = function () {
    if (!this.track || !this.content) {
      return;
    }

    this.root.classList.add('marquee--' + this.direction);

    this._buildAccessibleClone();
    this._bindHoverPause();

    if (this.prefersReducedMotion) {
      this.pause({ silent: true });
    } else {
      this.track.classList.add('marquee__track--running');
    }
  };

  /**
   * Clones the logo list for seamless looping. The clone is aria-hidden and
   * every focusable/interactive descendant inside it has interactivity
   * stripped so screen reader and keyboard users never reach duplicate
   * content (IMPLEMENTATION_PLAN.md §6.3).
   */
  Marquee.prototype._buildAccessibleClone = function () {
    if (!this.cloneContainer) {
      return;
    }
    var clone = this.content.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');

    var interactive = clone.querySelectorAll('a, button, input, select, textarea, [tabindex]');
    interactive.forEach(function (el) {
      el.setAttribute('tabindex', '-1');
      if (el.tagName === 'A') {
        el.removeAttribute('href');
      }
      if ('disabled' in el) {
        el.disabled = true;
      }
    });

    // Images inside the clone are decorative duplicates; ensure they never
    // announce (redundant alt text) even though aria-hidden on the
    // ancestor already removes them from the accessibility tree.
    var images = clone.querySelectorAll('img');
    images.forEach(function (img) {
      img.setAttribute('alt', '');
    });

    // Move the cloned items into the designated clone list so markup keeps
    // one authored source list + one generated clone list, matching the
    // static HTML scaffold in index.html.
    while (clone.firstChild) {
      this.cloneContainer.appendChild(clone.firstChild);
    }
  };

  Marquee.prototype._bindHoverPause = function () {
    var self = this;
    ['mouseenter', 'focusin'].forEach(function (evt) {
      self.root.addEventListener(evt, function () {
        self._hoverPaused = true;
        self._applyPausedState();
      });
    });
    ['mouseleave', 'focusout'].forEach(function (evt) {
      self.root.addEventListener(evt, function () {
        self._hoverPaused = false;
        self._applyPausedState();
      });
    });
  };

  Marquee.prototype._applyPausedState = function () {
    var shouldPause = this.isPaused || this._hoverPaused || this.prefersReducedMotion;
    this.track.classList.toggle('marquee__track--running', !shouldPause);
  };

  Marquee.prototype.play = function () {
    if (this.prefersReducedMotion) {
      return;
    }
    this.isPaused = false;
    this._applyPausedState();
  };

  Marquee.prototype.pause = function () {
    this.isPaused = true;
    this._applyPausedState();
  };

  /**
   * Wires one shared, persistent, visible pause/play control
   * ([data-marquee-playpause-all]) to every Marquee instance so both rows
   * pause/resume together. See module header for the "shared vs.
   * individual controls" decision.
   */
  function bindSharedPlayPause(instances) {
    var btn = document.querySelector('[data-marquee-playpause-all]');
    if (!btn || !instances.length) {
      return;
    }

    var icon = btn.querySelector('[data-marquee-playpause-icon]');
    var isPaused = false;

    function updateUI() {
      if (isPaused) {
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('aria-label', 'Play school logos animation');
        if (icon) {
          icon.textContent = '\u25B6';
        }
      } else {
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', 'Pause school logos animation');
        if (icon) {
          icon.textContent = '\u2759\u2759';
        }
      }
    }

    btn.addEventListener('click', function () {
      isPaused = !isPaused;
      instances.forEach(function (instance) {
        if (isPaused) {
          instance.pause();
        } else {
          instance.play();
        }
      });
      updateUI();
    });

    // If reduced-motion is on, every instance already starts paused;
    // reflect that in the shared control's initial state too.
    if (instances.every(function (instance) { return instance.prefersReducedMotion; })) {
      isPaused = true;
      updateUI();
    }
  }

  function initMarquees(root) {
    root = root || document;
    var nodes = Array.prototype.slice.call(root.querySelectorAll('[data-marquee]'));
    var instances = nodes.map(function (node) {
      return new Marquee(node);
    });
    bindSharedPlayPause(instances);
    return instances;
  }

  window.PSE = window.PSE || {};
  window.PSE.Marquee = Marquee;
  window.PSE.initMarquees = initMarquees;
})();

