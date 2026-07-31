# Premier Schools Exhibition (PSE) — Landing Page

Static, framework-free landing page for the PSE campaign: Hero, Participating
Schools, Choose the School, and Exhibition sections.

## Stack

- Semantic HTML5
- Custom CSS (no frameworks), BEM naming
- Vanilla JavaScript (no carousel/animation library)

No build step or dependencies required.

## Run locally

Any static file server works. For example:

```bash
npx serve .
```

or

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` (or the port shown).

## Project structure

```
index.html
css/
  base.css        # custom properties (provisional tokens), reset, typography, a11y baseline
  layout.css       # container/grid/flex layout foundations per section
  components.css   # BEM component styles
js/
  main.js          # defensive init/orchestration
  carousel.js       # shared carousel (hero dual-axis*, choose-school + exhibition single-axis)
  marquee.js         # continuous logo marquee (separate from carousel.js by design)
assets/
  images/
  icons/
```

\* Hero dual-axis interaction is implemented as a horizontal slide-index
carousel plus the minimal keyboard/swipe extension points for a vertical
axis. The exact Figma dual-axis interaction model was not confirmed at
implementation time (no Dev Mode access); the row/column content mapping
in `index.html` and `js/carousel.js` documents the placeholder model used
and what would need revisiting once Figma access is available.

## Known limitations / provisional state

- **Design tokens are provisional**, not extracted from the live Figma file.
  Colors, spacing, and type scale live as CSS custom properties in
  `css/base.css` for easy replacement once exact values are available.
- **Content (copy, logos, images) is placeholder**, not final Figma content.
  Placeholder SVGs live in `assets/images/`.
- **Breakpoints are fallback tiers** (480/768/1024/1280px) per the
  implementation plan, not confirmed Figma frame breakpoints.
- Hero dual-axis behavior is a foundation, not the final interaction — see
  the note above.

## Accessibility notes

- Skip-to-content link is the first focusable element.
- Carousels use the WAI-ARIA APG carousel pattern (`role="region"` +
  `aria-roledescription="carousel"`/`"slide"`), never `role="slider"`.
- Carousel live regions announce only user-initiated slide changes;
  autoplay ticks do not trigger announcements.
- Marquee clone list is `aria-hidden="true"` with all interactive
  descendants stripped of interactivity/tab order.
- All auto-moving components (hero, marquee) expose a persistent visible
  pause/play control in addition to pause-on-hover/focus.
- `prefers-reduced-motion` disables/reduces autoplay, marquee motion, and
  transition animation globally.

## QA status

**Headless browser QA (2026-07-31):** Ran automated browser QA in headless
Chrome (via temporary, non-project Playwright — no dependency added to this
repo) against a local static server (`python3 -m http.server`). Covered 320,
375, 768, 1024, 1440, 1920px widths plus a `prefers-reduced-motion: reduce`
pass. Zero console errors, zero page errors, zero failed/4xx/5xx resource
requests, and zero horizontal overflow at any width. No defects found — no
code changes were required as a result of this pass.

**axe-core accessibility audit (2026-07-31):** Ran `axe-core` 4.10.2 against
this project only, via temporary `playwright-core` driving system-installed
Google Chrome (headless) against a local static server. No dependency,
lockfile, or config added to this repo. **Zero violations** (serious,
moderate, or minor) at 375×900 and 1440×900, in both default and
autoplay-paused states. One benign `color-contrast` "incomplete" (needs-review,
not a violation) on `aria-hidden="true"` decorative icon glyphs inside
buttons, manually verified as high-contrast (`rgb(26,29,35)` on
`rgb(255,255,255)`) — not a defect. No code changes were required as a
result of this pass.

**W3C HTML/CSS validation (2026-07-31):** Ran `index.html` through the
[Nu HTML Checker](https://validator.w3.org/nu/) and each of `css/base.css`,
`css/components.css`, `css/layout.css` through the
[W3C CSS Validator](https://jigsaw.w3.org/css-validator/) (JSON output),
via `curl`, this project only. **HTML: 0 errors, 0 warnings.** **CSS: 0
errors** across all three files; **68 warnings total** (base.css 3,
components.css 31, layout.css 34), all validator-specific/unavoidable or
intentional — no fixes applied:
- 65 `css-variable` warnings ("CSS variables are currently not statically
  checked") — Jigsaw does not evaluate `var()`; inherent to using CSS
  custom properties, not a defect.
- 1 `vendor-extension` warning (`-webkit-text-size-adjust` in base.css) —
  intentional mobile Safari text-zoom fix with no standard equivalent.
- 1 `deprecatedproperty` warning (`clip` in base.css) — intentional legacy
  screen-reader/browser fallback kept alongside `clip-path` in the
  `.visually-hidden` utility, documented in a code comment.

Re-ran `node --check` on `js/carousel.js`, `js/main.js`, `js/marquee.js`
(pass, no syntax errors) as part of this session; no source files changed,
so no Chrome smoke re-test was needed.

Still not run: real cross-browser matrix (Firefox/Safari/real mobile
devices), screen reader pass — all require hardware not available in this
environment.

## Local checks run

These do not replace the QA items above but were run this session as the
closest locally-available substitute:

- `node --check` on `js/carousel.js`, `js/marquee.js`, `js/main.js` — pass,
  no syntax errors.
- Manual HTML structural check on `index.html` (tag balance, duplicate
  `id` attributes, heading-level sequence) — pass: tags balanced, no
  duplicate ids, heading order is `h1 → h2 → h3` with no skipped levels.
- Manual grep confirmation: zero `role="slider"` usages anywhere in `js/`
  or `index.html` (one code-comment mention only).
- Manual trace of `carousel.js` slide-index/autoplay/pause logic and
  `marquee.js` clone/pause logic — no defects found.
- Fixed one defect found via static inspection: `css/layout.css` had
  dead `.exhibition__slide` flex-basis rules (50%/33% at ≥768px/≥1024px)
  that were never reachable, since `carousel.js` only ever unhides one
  slide at a time for single-axis carousels. Removed so the exhibition
  section renders as a single-slide-visible carousel consistently at
  every breakpoint.
