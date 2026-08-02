/**
 * Accessible discrete carousels for the PSE landing page.
 *
 * The module supports four presentation modes:
 *   - track: one visible viewport with a translated track;
 *   - group: a page of several cards, with inactive cards removed from the
 *     accessibility tree;
 *   - select: all panels stay visible and the selected panel is emphasized;
 *   - dual track: the hero uses row/column coordinates and translates on both
 *     axes. The local Figma export exposes independent vertical hero columns,
 *     while the assignment requires horizontal and vertical controls. The
 *     authored row/column mapping therefore remains the documented provisional
 *     mapping until live Dev Mode interaction data is available.
 *
 * Autoplay is silent. Only user-triggered movement writes to the polite live
 * region. Temporary pauses (hover, focus, hidden page) never override a
 * persistent user pause, and reduced motion disables autoplay entirely.
 */

(function () {
  'use strict';

  var DEFAULT_INTERVAL = 6000;
  var DEFAULT_STATIC_MIN = 768;
  var TABLET_MIN = 768;
  var DESKTOP_MIN = 1400;
  var SWIPE_THRESHOLD = 40;

  function numberOr(value, fallback) {
    var parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  }

  function Carousel(root) {
    this.root = root;
    this.viewport = root.querySelector('[data-carousel-viewport]');
    this.track = root.querySelector('[data-carousel-track]');
    this.allSlideEls = Array.prototype.slice.call(root.querySelectorAll('[data-carousel-slide]'));
    this.slideEls = [];
    this.prevBtn = root.querySelector('[data-carousel-prev]');
    this.nextBtn = root.querySelector('[data-carousel-next]');
    this.upBtn = root.querySelector('[data-carousel-up]');
    this.downBtn = root.querySelector('[data-carousel-down]');
    this.playPauseBtn = root.querySelector('[data-carousel-playpause]');
    this.pagination = root.querySelector('[data-carousel-pagination]');
    this.liveRegion = root.querySelector('[data-carousel-live]');

    this.axis = root.dataset.carouselAxis || 'single';
    this.mode = root.dataset.carouselMode || 'single';
    this.autoplayEnabled = root.dataset.carouselAutoplay === 'true';
    this.interval = numberOr(root.dataset.carouselInterval, DEFAULT_INTERVAL);
    this.staticMinWidth = root.dataset.carouselStaticMin
      ? numberOr(root.dataset.carouselStaticMin, DEFAULT_STATIC_MIN)
      : (root.dataset.carouselDesktopStatic === 'true' ? 1400 : null);
    this.basePerView = Math.max(1, numberOr(root.dataset.carouselPerView, 1));
    this.authoredOrder = (root.dataset.carouselOrder || '').split(',').map(function (value) {
      return parseInt(value, 10);
    }).filter(function (value) {
      return !isNaN(value);
    });

    this.timerId = null;
    this.userPaused = false;
    this.pauseReasons = {};
    this.isPaused = !this.autoplayEnabled;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.row = 0;
    this.col = 0;
    this.perView = this._getPerView();
    this.wasStatic = this._isStatic();
    this._clickSuppressionTimer = null;

    this._onKeydown = this._onKeydown.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._handleResize = this._handleResize.bind(this);
    this._onMotionPreferenceChange = this._onMotionPreferenceChange.bind(this);

    this._refreshSlides();
    this._buildGrid();
    this.init();
  }

  Carousel.prototype._isStatic = function () {
    return this.staticMinWidth !== null && window.innerWidth >= this.staticMinWidth;
  };

  Carousel.prototype._getPerView = function () {
    if (this.mode !== 'group') {
      return 1;
    }

    if (window.innerWidth >= DESKTOP_MIN && this.root.dataset.carouselPerViewDesktop) {
      return Math.max(1, numberOr(this.root.dataset.carouselPerViewDesktop, this.basePerView));
    }
    if (window.innerWidth >= TABLET_MIN && this.root.dataset.carouselPerViewTablet) {
      return Math.max(1, numberOr(this.root.dataset.carouselPerViewTablet, this.basePerView));
    }
    return this.basePerView;
  };

  /** Keep responsive-only slides out of the active carousel model. */
  Carousel.prototype._refreshSlides = function () {
    var isMobile = window.innerWidth < TABLET_MIN;
    this.allSlideEls.forEach(function (slide) {
      var excluded = isMobile && slide.dataset.carouselHideMobile === 'true';
      slide.hidden = excluded;
      if (excluded) {
        slide.removeAttribute('aria-current');
        slide.removeAttribute('aria-hidden');
        slide.removeAttribute('inert');
        slide.classList.remove('is-active');
      }
    });
    this.slideEls = this.allSlideEls.filter(function (slide) {
      return !(isMobile && slide.dataset.carouselHideMobile === 'true');
    });
    this.slideEls.forEach(function (slide, index) {
      var label = slide.getAttribute('aria-label') || '';
      slide.setAttribute('aria-label', label.replace(/^\d+\s+of\s+\d+/, (index + 1) + ' of ' + this.slideEls.length));
    }, this);
  };

  Carousel.prototype._buildGrid = function () {
    var self = this;
    this.grid = [];
    this.perView = this._getPerView();

    if (this.mode === 'group') {
      this.sequence = this.authoredOrder.length === this.allSlideEls.length
        ? this.authoredOrder.map(function (index) { return self.allSlideEls[index]; }).filter(Boolean)
        : this.slideEls.slice();
      if (!this.sequence.length) {
        this.sequence = this.slideEls.slice();
      }
      this.grid[0] = [];
      for (var page = 0; page < Math.ceil(this.sequence.length / this.perView); page += 1) {
        this.grid[0].push(this.sequence[page * this.perView]);
      }
      return;
    }

    this.slideEls.forEach(function (slide, index) {
      var row = self.axis === 'dual' ? numberOr(slide.dataset.carouselRow, 0) : 0;
      var col = self.axis === 'dual' ? numberOr(slide.dataset.carouselCol, 0) : index;
      if (!self.grid[row]) {
        self.grid[row] = [];
      }
      self.grid[row][col] = slide;
    });

    this.grid = this.grid.map(function (row) {
      return row.filter(function (slide) { return !!slide; });
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
    if (!this.slideEls.length || !this.track) {
      return;
    }

    this._bindControls();
    this._bindHoverPause();
    this._bindKeyboard();
    this._bindSwipe();
    this._bindVisibilityPause();
    this._bindMotionPreference();
    this._buildPagination();
    this._setStaticState(this.wasStatic);

    if (!this.wasStatic) {
      this._prepareTrackLayout();
      this.goTo(0, 0, { userInitiated: false, announce: false });
    }

    this._syncTimer();
    this._updatePlayPauseUI();
    window.addEventListener('resize', this._handleResize);
  };

  Carousel.prototype._prepareTrackLayout = function () {
    if (this.mode !== 'track') {
      return;
    }

    if (this.axis === 'dual') {
      var columns = this.grid.reduce(function (maximum, row) {
        return Math.max(maximum, row.length);
      }, 1);
      this.track.style.gridTemplateColumns = 'repeat(' + columns + ', 100%)';
      this.track.style.gridTemplateRows = 'repeat(' + Math.max(1, this.grid.length) + ', 100%)';
      this.grid.forEach(function (row, rowIndex) {
        row.forEach(function (slide, colIndex) {
          slide.style.gridColumn = String(colIndex + 1);
          slide.style.gridRow = String(rowIndex + 1);
        });
      });
    } else {
      this.track.style.gridTemplateColumns = '';
      this.track.style.gridTemplateRows = '';
      this.slideEls.forEach(function (slide) {
        slide.style.gridColumn = '';
        slide.style.gridRow = '';
      });
    }
  };

  Carousel.prototype._clearPagination = function () {
    if (this.pagination) {
      this.pagination.innerHTML = '';
    }
    this.dots = [];
  };

  Carousel.prototype._buildPagination = function () {
    var self = this;
    this._clearPagination();
    if (!this.pagination) {
      return;
    }

    this.grid.forEach(function (rowSlides, rowIndex) {
      var rowGroup = document.createElement('div');
      rowGroup.className = 'carousel__pagination-row';
      rowGroup.setAttribute('data-carousel-pagination-row', String(rowIndex));
      if (self.axis === 'dual') {
        rowGroup.setAttribute('role', 'group');
        rowGroup.setAttribute('aria-label', 'Row ' + (rowIndex + 1) + ' of ' + self.grid.length);
      }

      rowSlides.forEach(function (slide, colIndex) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('data-carousel-dot', '');
        dot.setAttribute('data-row', String(rowIndex));
        dot.setAttribute('data-col', String(colIndex));
        dot.setAttribute('aria-label', self.axis === 'dual'
          ? 'Go to row ' + (rowIndex + 1) + ', slide ' + (colIndex + 1) + ' of ' + rowSlides.length
          : 'Go to slide ' + (colIndex + 1) + ' of ' + rowSlides.length);
        dot.addEventListener('click', function () {
          self.goTo(rowIndex, colIndex, { userInitiated: true, announce: true });
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
        if (self.userPaused) {
          self.play();
        } else {
          self.pause({ userInitiated: true });
        }
      });
    }

    if (this.mode === 'select') {
      this._bindSelectableSlides();
    }
  };

  Carousel.prototype._bindSelectableSlides = function () {
    var self = this;
    this.slideEls.forEach(function (slide) {
      if (slide.dataset.carouselSelectionBound === 'true') {
        return;
      }
      slide.dataset.carouselSelectionBound = 'true';
      slide.tabIndex = 0;
      slide.addEventListener('click', function () {
        var index = self.slideEls.indexOf(slide);
        if (index >= 0) {
          self.goTo(0, index, { userInitiated: true, announce: true });
        }
      });
      slide.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          var index = self.slideEls.indexOf(slide);
          if (index >= 0) {
            self.goTo(0, index, { userInitiated: true, announce: true });
          }
        }
      });
    });
  };

  Carousel.prototype._bindHoverPause = function () {
    var self = this;
    if (!this.autoplayEnabled) {
      return;
    }

    this.root.addEventListener('mouseenter', function () {
      self._setPauseReason('hover', true);
    });
    this.root.addEventListener('mouseleave', function () {
      self._setPauseReason('hover', false);
    });
    this.root.addEventListener('focusin', function () {
      self._setPauseReason('focus', true);
    });
    this.root.addEventListener('focusout', function (event) {
      if (!event.relatedTarget || !self.root.contains(event.relatedTarget)) {
        self._setPauseReason('focus', false);
      }
    });
  };

  Carousel.prototype._bindVisibilityPause = function () {
    var self = this;
    if (!this.autoplayEnabled) {
      return;
    }
    document.addEventListener('visibilitychange', function () {
      self._setPauseReason('page-hidden', document.hidden);
    });
  };

  Carousel.prototype._bindMotionPreference = function () {
    if (this.motionQuery.addEventListener) {
      this.motionQuery.addEventListener('change', this._onMotionPreferenceChange);
    } else if (this.motionQuery.addListener) {
      this.motionQuery.addListener(this._onMotionPreferenceChange);
    }
  };

  Carousel.prototype._onMotionPreferenceChange = function (event) {
    this.prefersReducedMotion = event.matches;
    this._syncTimer();
    this._updatePlayPauseUI();
  };

  Carousel.prototype._bindKeyboard = function () {
    this.root.addEventListener('keydown', this._onKeydown);
    if (!this.root.hasAttribute('tabindex') && !this._isStatic()) {
      this.root.tabIndex = 0;
    }
  };

  Carousel.prototype._onKeydown = function (event) {
    var target = event.target;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
      return;
    }
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
    var self = this;
    if (!this.viewport) {
      return;
    }
    this.viewport.addEventListener('pointerdown', this._onPointerDown);
    this.viewport.addEventListener('click', function (event) {
      if (!self._suppressClick) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      self._suppressClick = false;
      if (self._clickSuppressionTimer) {
        window.clearTimeout(self._clickSuppressionTimer);
        self._clickSuppressionTimer = null;
      }
    }, true);
  };

  Carousel.prototype._onPointerDown = function (event) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    this._suppressClick = false;
    if (this._clickSuppressionTimer) {
      window.clearTimeout(this._clickSuppressionTimer);
      this._clickSuppressionTimer = null;
    }
    this._dragStartX = event.clientX;
    this._dragStartY = event.clientY;
    this._dragDeltaX = 0;
    this._dragDeltaY = 0;
    this._dragging = true;
    this._pointerId = event.pointerId;
    if (this.viewport.setPointerCapture && event.pointerId != null) {
      try {
        this.viewport.setPointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture is an enhancement; the gesture still works without it.
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

  Carousel.prototype._onPointerUp = function () {
    var didDrag = false;
    if (this._dragging) {
      var absX = Math.abs(this._dragDeltaX);
      var absY = Math.abs(this._dragDeltaY);
      didDrag = Math.max(absX, absY) > SWIPE_THRESHOLD;
      if (this.axis === 'dual' && absY > absX && absY > SWIPE_THRESHOLD) {
        this.moveVertical(this._dragDeltaY < 0 ? 1 : -1, { userInitiated: true });
      } else if (absX > SWIPE_THRESHOLD) {
        this.moveHorizontal(this._dragDeltaX < 0 ? 1 : -1, { userInitiated: true });
      }
    }

    if (didDrag) {
      var self = this;
      this._suppressClick = true;
      this._clickSuppressionTimer = window.setTimeout(function () {
        self._suppressClick = false;
        self._clickSuppressionTimer = null;
      }, 500);
    }

    if (this.viewport.releasePointerCapture && this._pointerId != null) {
      try {
        this.viewport.releasePointerCapture(this._pointerId);
      } catch (error) {
        // Pointer capture may already have been released by the browser.
      }
    }
    this._dragging = false;
    this._dragDeltaX = 0;
    this._dragDeltaY = 0;
    this.viewport.removeEventListener('pointermove', this._onPointerMove);
    this.viewport.removeEventListener('pointerup', this._onPointerUp);
    this.viewport.removeEventListener('pointercancel', this._onPointerUp);
  };

  Carousel.prototype.moveHorizontal = function (delta, opts) {
    if (this._isStatic()) {
      return;
    }
    if (this.mode === 'group') {
      var pages = this._colCount(0);
      if (!pages) {
        return;
      }
      var page = ((this.col + delta) % pages + pages) % pages;
      this.goTo(0, page, Object.assign({ announce: true }, opts));
      return;
    }
    var length = this._colCount(this.row);
    if (!length) {
      return;
    }
    var nextCol = ((this.col + delta) % length + length) % length;
    this.goTo(this.row, nextCol, Object.assign({ announce: true }, opts));
  };

  Carousel.prototype.moveVertical = function (delta, opts) {
    if (this._isStatic() || this.mode === 'group' || this.mode === 'select') {
      return;
    }
    var rows = this._rowCount();
    if (rows < 2) {
      return;
    }
    var nextRow = ((this.row + delta) % rows + rows) % rows;
    var nextCol = Math.min(this.col, this._colCount(nextRow) - 1);
    this.goTo(nextRow, nextCol, Object.assign({ announce: true }, opts));
  };

  Carousel.prototype.next = function (opts) {
    this.moveHorizontal(1, opts);
  };

  Carousel.prototype.prev = function (opts) {
    this.moveHorizontal(-1, opts);
  };

  Carousel.prototype._autoAdvance = function () {
    if (this.mode === 'group') {
      this.moveHorizontal(1, { userInitiated: false, announce: false });
      return;
    }

    var lastColumn = this.col >= this._colCount(this.row) - 1;
    var lastRow = this.row >= this._rowCount() - 1;
    if (this.axis === 'dual' && lastColumn && lastRow) {
      this.goTo(0, 0, { userInitiated: false, announce: false });
    } else if (this.axis === 'dual' && lastColumn) {
      this.goTo(this.row + 1, 0, { userInitiated: false, announce: false });
    } else {
      this.moveHorizontal(1, { userInitiated: false, announce: false });
    }
  };

  Carousel.prototype.goTo = function (row, col, opts) {
    opts = opts || {};
    if (this._isStatic()) {
      return;
    }

    var nextSlide = this.grid[row] && this.grid[row][col];
    if (!nextSlide) {
      return;
    }

    if (this.mode === 'track') {
      this.slideEls.forEach(function (slide) {
        slide.hidden = false;
      });
      var firstSlide = this.slideEls[0];
      var offsetX = nextSlide.offsetLeft - firstSlide.offsetLeft;
      var offsetY = this.axis === 'dual' ? nextSlide.offsetTop - firstSlide.offsetTop : 0;
      this.track.style.transform = 'translate3d(-' + offsetX + 'px, -' + offsetY + 'px, 0)';
      this._setActiveTrackSlide(nextSlide);
      this.root.dataset.carouselIndex = this.axis === 'dual' ? row + '-' + col : String(col);
    } else if (this.mode === 'group') {
      var start = col * this.perView;
      var end = start + this.perView;
      var sequence = this.sequence;
      sequence.forEach(function (slide, position) {
        slide.style.order = String(position);
        var visible = position >= start && position < end;
        slide.hidden = !visible;
        slide.classList.toggle('is-active', visible);
        if (visible) {
          if (position === start) {
            slide.setAttribute('aria-current', 'true');
          } else {
            slide.removeAttribute('aria-current');
          }
          slide.removeAttribute('aria-hidden');
          slide.removeAttribute('inert');
        } else {
          slide.removeAttribute('aria-current');
          slide.setAttribute('aria-hidden', 'true');
          slide.setAttribute('inert', '');
        }
      });
      this.track.style.transform = '';
      this.root.dataset.carouselIndex = String(col);
    } else if (this.mode === 'select') {
      this.slideEls.forEach(function (slide) {
        slide.hidden = false;
        slide.removeAttribute('aria-hidden');
        slide.removeAttribute('inert');
        slide.classList.toggle('is-active', slide === nextSlide);
        if (slide === nextSlide) {
          slide.setAttribute('aria-current', 'true');
        } else {
          slide.removeAttribute('aria-current');
        }
      });
      this.root.dataset.carouselIndex = String(col);
    } else {
      this.slideEls.forEach(function (slide) {
        slide.hidden = slide !== nextSlide;
      });
    }

    this.row = row;
    this.col = col;
    this._updateDots(row, col);

    if (opts.announce && this.liveRegion) {
      if (opts.userInitiated) {
        this.liveRegion.setAttribute('aria-live', 'polite');
        this.liveRegion.textContent = nextSlide.getAttribute('aria-label') || '';
      } else {
        this.liveRegion.setAttribute('aria-live', 'off');
        this.liveRegion.textContent = '';
      }
    }

    if (opts.userInitiated) {
      this._syncTimer();
    }
  };

  Carousel.prototype._setActiveTrackSlide = function (activeSlide) {
    var isDual = this.axis === 'dual';
    this.slideEls.forEach(function (slide) {
      var active = slide === activeSlide;
      slide.classList.toggle('is-active', active);
      if (active) {
        slide.setAttribute('aria-current', 'true');
        slide.removeAttribute('aria-hidden');
        slide.removeAttribute('inert');
      } else {
        slide.removeAttribute('aria-current');
        slide.setAttribute('aria-hidden', 'true');
        slide.setAttribute('inert', '');
      }
      if (!isDual && slide.hidden) {
        slide.hidden = false;
      }
    });
  };

  Carousel.prototype._updateDots = function (row, col) {
    if (!this.dots) {
      return;
    }
    this.dots.forEach(function (dot) {
      var current = numberOr(dot.dataset.row, 0) === row && numberOr(dot.dataset.col, 0) === col;
      dot.setAttribute('aria-current', current ? 'true' : 'false');
    });
  };

  Carousel.prototype._setRootState = function (isStatic) {
    this.root.classList.toggle('carousel--static', isStatic);
    this.root.dataset.carouselState = isStatic ? 'static' : 'active';
  };

  Carousel.prototype._setStaticState = function (isStatic) {
    var self = this;
    this._setRootState(isStatic);
    this.allSlideEls.forEach(function (slide) {
      var excluded = window.innerWidth < TABLET_MIN && slide.dataset.carouselHideMobile === 'true';
      slide.style.order = '';
      slide.style.gridColumn = '';
      slide.style.gridRow = '';
      slide.classList.remove('is-active');
      slide.removeAttribute('aria-current');
      slide.removeAttribute('aria-hidden');
      slide.removeAttribute('inert');
      slide.hidden = excluded;
    });
    this.track.style.transform = '';
    this.track.style.gridTemplateColumns = '';
    this.track.style.gridTemplateRows = '';

    [this.prevBtn, this.nextBtn, this.upBtn, this.downBtn].forEach(function (button) {
      if (button) {
        button.disabled = isStatic;
      }
    });
    if (this.pagination) {
      this.pagination.hidden = isStatic;
      this.pagination.setAttribute('aria-hidden', isStatic ? 'true' : 'false');
    }
    var controls = this.pagination && this.pagination.parentElement;
    if (controls && controls !== this.root) {
      controls.classList.toggle('carousel-controls--static', isStatic);
    }

    if (isStatic) {
      if (this.root.dataset.carouselManagedTabindex === 'true') {
        this.root.removeAttribute('tabindex');
      }
      this._clearTimer();
    } else {
      if (!this.root.hasAttribute('tabindex')) {
        this.root.tabIndex = 0;
        this.root.dataset.carouselManagedTabindex = 'true';
      }
      self._prepareTrackLayout();
      this.goTo(this.row, this.col, { userInitiated: false, announce: false });
    }
    this._syncTimer();
  };

  Carousel.prototype._setPauseReason = function (reason, paused) {
    if (paused) {
      this.pauseReasons[reason] = true;
    } else {
      delete this.pauseReasons[reason];
    }
    this._syncTimer();
  };

  Carousel.prototype._hasTemporaryPause = function () {
    return Object.keys(this.pauseReasons).length > 0;
  };

  Carousel.prototype._canRun = function () {
    return this.autoplayEnabled && !this.userPaused && !this.prefersReducedMotion && !this._isStatic() && !this._hasTemporaryPause();
  };

  Carousel.prototype._syncTimer = function () {
    if (this._canRun()) {
      this._startTimer();
    } else {
      this._clearTimer();
    }
    this.isPaused = !this._canRun();
    this._updatePlayPauseUI();
  };

  Carousel.prototype.play = function () {
    if (this.prefersReducedMotion) {
      this.userPaused = false;
      this._syncTimer();
      return;
    }
    this.userPaused = false;
    this._syncTimer();
  };

  Carousel.prototype.pause = function (opts) {
    opts = opts || {};
    if (opts.userInitiated) {
      this.userPaused = true;
    }
    this._syncTimer();
  };

  Carousel.prototype._updatePlayPauseUI = function () {
    if (!this.playPauseBtn) {
      return;
    }
    var icon = this.playPauseBtn.querySelector('[data-carousel-playpause-icon]');
    if (this.prefersReducedMotion) {
      this.playPauseBtn.disabled = true;
      this.playPauseBtn.setAttribute('aria-pressed', 'true');
      this.playPauseBtn.setAttribute('aria-label', 'Autoplay disabled because reduced motion is enabled');
      if (icon) {
        icon.textContent = '\u25B6';
      }
      return;
    }
    this.playPauseBtn.disabled = false;
    this.playPauseBtn.setAttribute('aria-pressed', this.userPaused ? 'true' : 'false');
    this.playPauseBtn.setAttribute('aria-label', this.userPaused ? 'Play carousel autoplay' : 'Pause carousel autoplay');
    if (icon) {
      icon.textContent = this.userPaused ? '\u25B6' : '\u2759\u2759';
    }
  };

  Carousel.prototype._startTimer = function () {
    var self = this;
    if (this.timerId || !this.autoplayEnabled) {
      return;
    }
    this.timerId = window.setInterval(function () {
      self._autoAdvance();
    }, this.interval);
  };

  Carousel.prototype._clearTimer = function () {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  };

  Carousel.prototype._handleResize = function () {
    var previousSlideCount = this.slideEls.length;
    var previousPerView = this.perView;
    var wasStatic = this.wasStatic;
    this._refreshSlides();
    if (this.mode === 'select') {
      this._bindSelectableSlides();
    }
    this._buildGrid();
    var isStatic = this._isStatic();
    var responsiveModelChanged = previousSlideCount !== this.slideEls.length || previousPerView !== this.perView;
    this.wasStatic = isStatic;

    if (responsiveModelChanged) {
      this._buildPagination();
      this.row = 0;
      this.col = 0;
    }

    if (wasStatic !== isStatic || responsiveModelChanged) {
      this._setStaticState(isStatic);
    } else {
      this._syncTimer();
    }
  };

  function initCarousels(root) {
    root = root || document;
    return Array.prototype.slice.call(root.querySelectorAll('[data-carousel]')).map(function (node) {
      return new Carousel(node);
    });
  }

  window.PSE = window.PSE || {};
  window.PSE.Carousel = Carousel;
  window.PSE.initCarousels = initCarousels;
})();
