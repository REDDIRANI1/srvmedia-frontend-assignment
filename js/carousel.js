/**
 * carousel.js
 * Shared carousel module powering the Hero (dual-axis 2D grid), Choose-the-
 * School (single-axis, mobile only), and Exhibition (single-axis) sections.
 *
 * DUAL-AXIS STATE MODEL (Hero only, data-carousel-axis="dual")
 * --------------------------------------------------------------------------
 * The exact Figma dual-axis interaction (what horizontal vs. vertical
 * movement means content-wise) could not be confirmed: the only local
 * reference is a saved browser export of Figma's own prototype-viewer
 * application shell, which requires a live WebGL context and network
 * access to Figma's servers to render the design canvas. It could not be
 * rendered offline (verified: headless Chrome renders only the viewer
 * chrome — login/comment overlay, a "Restart" control, a thumbnail — never
 * the actual design canvas), and its companion asset files are Figma
 * comment-thread avatars, not design imagery. This is a documented open
 * blocker (Figma Dev Mode access required), not yet resolved.
 *
 * Given that, this module implements the SMALLEST defensible model that
 * genuinely has two independent, meaningful navigation axes rather than a
 * single-axis carousel with a decorative vertical skin:
 *
 *   - Slides are addressed by (row, col) instead of a flat index.
 *   - Each [data-carousel-slide] declares data-carousel-row / -col.
 *   - Left/Right (or horizontal swipe/drag) move column within the
 *     current row, wrapping at the row's own length.
 *   - Up/Down (or vertical swipe/drag) move row, wrapping across the
 *     total row count; column is clamped into range for the target row
 *     (rows may have different lengths).
 *   - Autoplay advances the horizontal axis within the current row, then
 *     wraps to (row 0, col 0) after the last row's last column — i.e. a
 *     single continuous cycle that visits every slide exactly once. This
 *     is a deliberate, documented choice, not a confirmed Figma behavior;
 *     the row/column content mapping must be revisited once real Figma
 *     access is available (see index.html hero markup comment).
 *
 * Single-axis mode (data-carousel-axis="single", used by Choose-the-School
 * and Exhibition) is unchanged: slides are a flat list, only Left/Right
 * and horizontal swipe apply, and the dual-axis code paths are simply
 * never engaged (rows collapse to a single implicit row of length N).
 *
 * ARIA pattern: WAI-ARIA APG carousel — never role="slider" (see
 * IMPLEMENTATION_PLAN.md §6.1). Each instance:
 *   - container: role="region" aria-roledescription="carousel"
 *   - each slide: role="group" aria-roledescription="slide"
 *   - a live region announces only user-initiated changes (aria-live
 *     toggled to "polite" on demand, otherwise "off" to suppress autoplay
 *     announcement spam).
 *
 * Public behavior (per-instance), driven by data attributes on the
 * `[data-carousel]` root:
 *   data-carousel-axis        "single" | "dual"
 *   data-carousel-autoplay    "true" | "false"
 *   data-carousel-interval    ms between autoplay advances (default 6000)
 *   data-carousel-desktop-static "true" — disables carousel mechanics above
 *                              the desktop breakpoint (Choose-the-School only;
 *                              the CSS grid takes over, JS still initializes
 *                              but next/prev/autoplay become no-ops while static)
 */

(function () {
  'use strict';

  var DESKTOP_STATIC_MIN_WIDTH = 1024;
  var DEFAULT_INTERVAL = 6000;
  var SWIPE_THRESHOLD = 40;

  /**
   * @param {HTMLElement} root - the [data-carousel] container
   */
  function Carousel(root) {
    this.root = root;
    this.viewport = root.querySelector('[data-carousel-viewport]');
    this.track = root.querySelector('[data-carousel-track]');
    this.slideEls = Array.prototype.slice.call(root.querySelectorAll('[data-carousel-slide]'));
    this.prevBtn = root.querySelector('[data-carousel-prev]');
    this.nextBtn = root.querySelector('[data-carousel-next]');
    this.upBtn = root.querySelector('[data-carousel-up]');
    this.downBtn = root.querySelector('[data-carousel-down]');
    this.playPauseBtn = root.querySelector('[data-carousel-playpause]');
    this.pagination = root.querySelector('[data-carousel-pagination]');
    this.liveRegion = root.querySelector('[data-carousel-live]');

    this.axis = root.dataset.carouselAxis || 'single';
    this.autoplayEnabled = root.dataset.carouselAutoplay === 'true';
    this.interval = parseInt(root.dataset.carouselInterval, 10) || DEFAULT_INTERVAL;
    this.desktopStatic = root.dataset.carouselDesktopStatic === 'true';

    this.timerId = null;
    this.isPaused = !this.autoplayEnabled;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._onKeydown = this._onKeydown.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    this._buildGrid();
    this.row = 0;
    this.col = 0;

    this.init();
  }

  /**
   * Builds the internal row/col grid model from the DOM.
   * Single-axis instances: every slide is treated as row 0, col = its
   * document order — i.e. one row containing all slides, so all the
   * row-aware logic below degrades to the previous flat-list behavior
   * without a separate code path.
   */
  Carousel.prototype._buildGrid = function () {
    var self = this;
    this.grid = [];
    this.slideEls.forEach(function (slide, i) {
      var r = self.axis === 'dual' ? parseInt(slide.dataset.carouselRow, 10) || 0 : 0;
      var c = self.axis === 'dual' ? parseInt(slide.dataset.carouselCol, 10) || 0 : i;
      if (!self.grid[r]) {
        self.grid[r] = [];
      }
      self.grid[r][c] = slide;
    });
    // Compact any sparse columns (defensive; authored markup should be dense).
    this.grid = this.grid.map(function (row) {
      return row.filter(function (slide) {
        return !!slide;
      });
    });
  };

  Carousel.prototype._rowCount = function () {
    return this.grid.length;
  };

  Carousel.prototype._colCount = function (row) {
    return this.grid[row] ? this.grid[row].length : 0;
  };

  Carousel.prototype._currentSlide = function () {
    return this.grid[this.row] && this.grid[this.row][this.col];
  };

  Carousel.prototype.init = function () {
    if (!this.slideEls.length) {
      return;
    }

    this._buildPagination();
    this._bindControls();
    this._bindHoverPause();
    this._bindKeyboard();
    this._bindSwipe();
    this.goTo(0, 0, { userInitiated: false, announce: false });

    if (this.autoplayEnabled && !this.prefersReducedMotion && !this._isDesktopStatic()) {
      this.play();
    }

    window.addEventListener('resize', this._handleResize.bind(this));
  };

  Carousel.prototype._isDesktopStatic = function () {
    return this.desktopStatic && window.innerWidth >= DESKTOP_STATIC_MIN_WIDTH;
  };

  Carousel.prototype._handleResize = function () {
    if (this._isDesktopStatic()) {
      this.pause({ userInitiated: false });
    }
  };

  /**
   * Pagination for dual-axis: one dot-row per grid row, each dot-row
   * grouping the columns within that row, so screen reader / sighted
   * users can see both the row and column position at a glance. For
   * single-axis instances this renders as the previous flat dot list
   * (one row, N columns).
   */
  Carousel.prototype._buildPagination = function () {
    if (!this.pagination) {
      return;
    }
    var self = this;
    this.dots = [];
    this.grid.forEach(function (rowSlides, r) {
      var rowGroup = document.createElement('div');
      rowGroup.className = 'carousel__pagination-row';
      rowGroup.setAttribute('data-carousel-pagination-row', String(r));
      if (self.axis === 'dual') {
        // A plain <div> with aria-label but no role is not reliably
        // exposed as a named group by screen readers (the label has
        // nothing to attach to without an accessible role) — role="group"
        // makes the per-row label actually announce.
        rowGroup.setAttribute('role', 'group');
        rowGroup.setAttribute('aria-label', 'Row ' + (r + 1) + ' of ' + self.grid.length);
      }

      rowSlides.forEach(function (slide, c) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('data-carousel-dot', '');
        dot.setAttribute('data-row', String(r));
        dot.setAttribute('data-col', String(c));
        var label = self.axis === 'dual'
          ? 'Go to row ' + (r + 1) + ', slide ' + (c + 1) + ' of ' + rowSlides.length
          : 'Go to slide ' + (c + 1) + ' of ' + rowSlides.length;
        dot.setAttribute('aria-label', label);
        dot.setAttribute('aria-current', (r === 0 && c === 0) ? 'true' : 'false');
        dot.addEventListener('click', function () {
          self.goTo(r, c, { userInitiated: true, announce: true });
        });
        rowGroup.appendChild(dot);
        self.dots.push(dot);
      });

      self.pagination.appendChild(rowGroup);
    });
  };

  Carousel.prototype._bindControls = function () {
    var self = this;
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', function () {
        self.moveHorizontal(-1, { userInitiated: true });
      });
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', function () {
        self.moveHorizontal(1, { userInitiated: true });
      });
    }
    if (this.upBtn) {
      this.upBtn.addEventListener('click', function () {
        self.moveVertical(-1, { userInitiated: true });
      });
    }
    if (this.downBtn) {
      this.downBtn.addEventListener('click', function () {
        self.moveVertical(1, { userInitiated: true });
      });
    }
    if (this.playPauseBtn) {
      this.playPauseBtn.addEventListener('click', function () {
        if (self.isPaused) {
          self.play();
        } else {
          self.pause({ userInitiated: true });
        }
      });
    }
  };

  Carousel.prototype._bindHoverPause = function () {
    var self = this;
    if (!this.autoplayEnabled) {
      return;
    }
    ['mouseenter', 'focusin'].forEach(function (evt) {
      self.root.addEventListener(evt, function () {
        self._wasPlayingBeforeHover = !self.isPaused;
        if (!self.isPaused) {
          self._clearTimer();
        }
      });
    });
    ['mouseleave', 'focusout'].forEach(function (evt) {
      self.root.addEventListener(evt, function () {
        if (self._wasPlayingBeforeHover && !self.isPaused && !self.prefersReducedMotion) {
          self._startTimer();
        }
      });
    });
  };

  Carousel.prototype._bindKeyboard = function () {
    this.root.addEventListener('keydown', this._onKeydown);
  };

  Carousel.prototype._onKeydown = function (event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.moveHorizontal(1, { userInitiated: true });
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.moveHorizontal(-1, { userInitiated: true });
    } else if (event.key === 'ArrowDown' && this.axis === 'dual') {
      event.preventDefault();
      this.moveVertical(1, { userInitiated: true });
    } else if (event.key === 'ArrowUp' && this.axis === 'dual') {
      event.preventDefault();
      this.moveVertical(-1, { userInitiated: true });
    }
  };

  Carousel.prototype._bindSwipe = function () {
    if (!this.viewport) {
      return;
    }
    this.viewport.addEventListener('pointerdown', this._onPointerDown);
  };

  Carousel.prototype._onPointerDown = function (event) {
    this._dragStartX = event.clientX;
    this._dragStartY = event.clientY;
    this._dragDeltaX = 0;
    this._dragDeltaY = 0;
    this._dragging = true;
    this._pointerId = event.pointerId;
    // Capture the pointer so fast swipes that exit the viewport bounds
    // mid-gesture still deliver pointermove/pointerup to this element
    // instead of silently dropping the gesture (leaving _dragging stuck).
    if (this.viewport.setPointerCapture && event.pointerId != null) {
      try {
        this.viewport.setPointerCapture(event.pointerId);
      } catch (err) {
        // Ignore — capture is a robustness enhancement, not required.
      }
    }
    this.viewport.addEventListener('pointermove', this._onPointerMove);
    this.viewport.addEventListener('pointerup', this._onPointerUp);
    this.viewport.addEventListener('pointercancel', this._onPointerUp);
  };

  Carousel.prototype._onPointerMove = function (event) {
    if (!this._dragging) {
      return;
    }
    this._dragDeltaX = event.clientX - this._dragStartX;
    this._dragDeltaY = event.clientY - this._dragStartY;
  };

  /**
   * Axis detection on release: whichever of |dx|/|dy| is larger determines
   * whether this gesture is horizontal or vertical navigation. Vertical
   * gestures are only honored in dual-axis mode; single-axis instances
   * only ever see horizontal swipe, matching their one navigable axis.
   */
  Carousel.prototype._onPointerUp = function () {
    if (this._dragging) {
      var absX = Math.abs(this._dragDeltaX);
      var absY = Math.abs(this._dragDeltaY);

      if (this.axis === 'dual' && absY > absX && absY > SWIPE_THRESHOLD) {
        this.moveVertical(this._dragDeltaY < 0 ? 1 : -1, { userInitiated: true });
      } else if (absX > SWIPE_THRESHOLD) {
        this.moveHorizontal(this._dragDeltaX < 0 ? 1 : -1, { userInitiated: true });
      }
    }
    this._dragging = false;
    this._dragDeltaX = 0;
    this._dragDeltaY = 0;
    this.viewport.removeEventListener('pointermove', this._onPointerMove);
    this.viewport.removeEventListener('pointerup', this._onPointerUp);
    this.viewport.removeEventListener('pointercancel', this._onPointerUp);
  };

  /**
   * Moves within the current row by `delta` columns, wrapping at the
   * row's own length. This is the horizontal axis.
   */
  Carousel.prototype.moveHorizontal = function (delta, opts) {
    var len = this._colCount(this.row);
    if (!len) {
      return;
    }
    var nextCol = ((this.col + delta) % len + len) % len;
    this.goTo(this.row, nextCol, Object.assign({ announce: true }, opts));
  };

  /**
   * Moves to another row by `delta`, wrapping at the total row count.
   * Column is clamped into the target row's range since rows may have
   * different lengths (this is the vertical axis).
   */
  Carousel.prototype.moveVertical = function (delta, opts) {
    var rows = this._rowCount();
    if (rows < 2) {
      return;
    }
    var nextRow = ((this.row + delta) % rows + rows) % rows;
    var nextCol = Math.min(this.col, this._colCount(nextRow) - 1);
    this.goTo(nextRow, nextCol, Object.assign({ announce: true }, opts));
  };

  /**
   * Autoplay tick: advance horizontally within the row; when already at
   * the last column of the last row, wrap to (0, 0). This visits every
   * slide in the grid exactly once per full cycle. See module header for
   * why this specific traversal order is a documented placeholder.
   */
  Carousel.prototype._autoAdvance = function () {
    var isLastCol = this.col >= this._colCount(this.row) - 1;
    var isLastRow = this.row >= this._rowCount() - 1;
    if (isLastCol && isLastRow) {
      this.goTo(0, 0, { userInitiated: false, announce: true });
    } else if (isLastCol) {
      this.goTo(this.row + 1, 0, { userInitiated: false, announce: true });
    } else {
      this.goTo(this.row, this.col + 1, { userInitiated: false, announce: true });
    }
  };

  Carousel.prototype.next = function (opts) {
    this.moveHorizontal(1, opts);
  };

  Carousel.prototype.prev = function (opts) {
    this.moveHorizontal(-1, opts);
  };

  Carousel.prototype.goTo = function (row, col, opts) {
    opts = opts || {};
    var nextSlide = this.grid[row] && this.grid[row][col];
    if (!nextSlide) {
      return;
    }

    this.slideEls.forEach(function (slide) {
      slide.hidden = slide !== nextSlide;
    });

    this.row = row;
    this.col = col;

    if (this.dots) {
      this.dots.forEach(function (dot) {
        var isCurrent = parseInt(dot.dataset.row, 10) === row && parseInt(dot.dataset.col, 10) === col;
        dot.setAttribute('aria-current', isCurrent ? 'true' : 'false');
      });
    }

    if (opts.announce && this.liveRegion) {
      // Only announce for user-initiated changes; autoplay ticks keep the
      // live region "off" to avoid spamming screen reader users.
      if (opts.userInitiated) {
        this.liveRegion.setAttribute('aria-live', 'polite');
        this.liveRegion.textContent = nextSlide.getAttribute('aria-label') || '';
      } else {
        this.liveRegion.setAttribute('aria-live', 'off');
        this.liveRegion.textContent = '';
      }
    }

    if (opts.userInitiated && this.autoplayEnabled && !this.isPaused) {
      // Restart the autoplay clock on manual navigation so the next auto
      // advance doesn't fire immediately after a user action.
      this._restartTimer();
    }
  };

  Carousel.prototype.play = function () {
    if (this.prefersReducedMotion || this._isDesktopStatic() || !this.slideEls.length) {
      return;
    }
    this.isPaused = false;
    this._startTimer();
    this._updatePlayPauseUI();
  };

  Carousel.prototype.pause = function () {
    this.isPaused = true;
    this._clearTimer();
    this._updatePlayPauseUI();
  };

  Carousel.prototype._updatePlayPauseUI = function () {
    if (!this.playPauseBtn) {
      return;
    }
    var icon = this.playPauseBtn.querySelector('[data-carousel-playpause-icon]');
    if (this.isPaused) {
      this.playPauseBtn.setAttribute('aria-pressed', 'true');
      this.playPauseBtn.setAttribute('aria-label', 'Play carousel autoplay');
      if (icon) {
        icon.textContent = '\u25B6'; // ▶
      }
    } else {
      this.playPauseBtn.setAttribute('aria-pressed', 'false');
      this.playPauseBtn.setAttribute('aria-label', 'Pause carousel autoplay');
      if (icon) {
        icon.textContent = '\u2759\u2759'; // ❙❙
      }
    }
  };

  Carousel.prototype._startTimer = function () {
    var self = this;
    this._clearTimer();
    this.timerId = window.setInterval(function () {
      self._autoAdvance();
    }, this.interval);
  };

  Carousel.prototype._restartTimer = function () {
    if (!this.isPaused) {
      this._startTimer();
    }
  };

  Carousel.prototype._clearTimer = function () {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  };

  /**
   * Initializes every [data-carousel] element on the page.
   * @returns {Carousel[]}
   */
  function initCarousels(root) {
    root = root || document;
    var nodes = Array.prototype.slice.call(root.querySelectorAll('[data-carousel]'));
    return nodes.map(function (node) {
      return new Carousel(node);
    });
  }

  window.PSE = window.PSE || {};
  window.PSE.Carousel = Carousel;
  window.PSE.initCarousels = initCarousels;
})();
