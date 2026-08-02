# Premier Schools Exhibition (PSE) — Landing Page

Static, framework-free landing page for the Premier Schools Exhibition campaign
in Gurugram. The page contains the complete 13-region flow from the supplied
desktop and mobile design references.

## Stack

- Semantic HTML5
- Custom CSS (no frameworks), BEM naming
- Vanilla JavaScript (no carousel/animation library)

No build step or dependencies required.

## Run locally

Any static file server works. The QA harness uses:

```bash
python3 -m http.server 8931 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8931`.

## Project structure

```
index.html
css/
  base.css        # tokens, reset, typography, a11y baseline
  layout.css       # container/grid/flex layout foundations per section
  components.css   # BEM component styles
js/
  main.js          # defensive init/orchestration
  carousel.js       # shared hero and responsive section carousels
  marquee.js         # continuous logo marquee (separate from carousel.js by design)
assets/
  images/
  icons/
```

* Hero uses independent row/column navigation for horizontal and vertical
movement, keyboard controls, dominant-axis pointer swipes, autoplay, and
pause controls. The exact Figma prototype mapping was not available offline,
so the authored row/column mapping remains provisional and is documented in
`index.html` and `js/carousel.js`.

## Implemented behavior

- The hero autoplay pauses on hover, focus, hidden-page state, and persistent
  user pause. Autoplay changes are silent; user changes use one polite live
  region.
- Choose School and Reviews become static grids from 768px. Benefits uses
  responsive grouped pages. Attractions keeps all source-backed diamonds
  visible and gives the selected panel a visible state; it does not autoplay.
- School logos use two opposite-direction marquees with one shared pause/play
  control. Generated duplicate logo lists are `aria-hidden` and non-focusable.
- Reduced motion disables autoplay, marquee travel, and nonessential
  transitions.
- The enquiry form validates its fields and reports a truthful local-prototype
  message. It does not send data. The event-video action opens an information
  panel because no playback URL was supplied.
- With JavaScript disabled, enhancement controls are hidden and the authored
  cards, logos, reviews, gallery, form, and contact content remain readable.

## Known limitations

- The exact interactive hero row/column mapping needs confirmation from live
  Figma Dev Mode. Do not treat the current mapping as source-backed behavior.
- The extracted blog listing and inner-page flows are outside the authoritative
  PSE landing-page scope; no blog routes or blog assets are included here.
- Proprietary Museo Sans, Optima LT Std, and Proxima Nova files were not
  supplied or licensed. Legal Open Sans, Raleway, and Archivo stacks plus
  system fallbacks are used instead, so small line-wrap and rasterization
  differences are expected.
- No form endpoint or event-video URL was supplied, so both interactions are
  intentionally local and truthful rather than simulated network behavior.

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

**Headless browser QA (2026-08-02):** Ran temporary CDP-driven Chrome checks
against the local static server at 430, 768, 1024, 1399, 1440, and 1920px.
The final pass reported zero runtime errors and no horizontal document
overflow. Exact-width full-page captures were produced at 430px and 1920px;
the rendered document heights were 5626px and 7072px respectively in Chrome
with the vertical scrollbar present.

The checks covered hero horizontal/vertical movement, school-card next and
swipe movement, attraction selection, grouped Benefits navigation, autoplay,
hover/focus/page-hidden pause reasons, persistent user pause, shared marquee
pause/play, reduced motion, video information fallback, form demo handling,
and JavaScript-disabled content fallback. Inactive carousel slides exposed no
focusable descendants.

**axe-core accessibility audit (2026-08-02):** Temporary `axe-core` 4.10.2
audits reported **zero violations** (serious, moderate, or minor) at 430x900
and 1440x900 in the default state, at 430x900 with the hero paused, and at
430x900 with reduced motion. Axe reported only `color-contrast` incomplete
checks for gradient/pseudo-element cases (42 mobile nodes and 61 desktop
nodes); representative rendered color pairs were manually checked and pass
WCAG AA, including the small-text and large-text cases. The repair pass also
rechecked one heading, unique IDs, empty links, labelled form controls, image
alternatives, accessible button names, and hidden-slide focusability.

**W3C HTML/CSS validation (2026-08-02):** Ran `index.html` through the
[Nu HTML Checker](https://validator.w3.org/nu/) and each of `css/base.css`,
`css/components.css`, `css/layout.css` through the
[W3C CSS Validator](https://jigsaw.w3.org/css-validator/) (JSON output),
via `curl`. **HTML: 0 messages.** `layout.css` and `components.css` each
returned **0 errors and 0 warnings**. The `base.css` request remained blocked
by the validator's repeated TLS `bad record mac` response, so it is not
claimed as validated.

`node --check` passes for `js/carousel.js`, `js/main.js`, and `js/marquee.js`.
`git diff --check` passes.

Still not run: the mandatory cross-browser matrix (Firefox, Safari, Edge,
previous/current versions), real iOS/Android devices, and a manual VoiceOver
or NVDA walkthrough. Those require hosted browser services or hardware not
available in this environment.

## Local checks run

These do not replace the QA items above but were run this session as the
closest locally-available substitute:

- `node --check` on all three JavaScript files — pass.
- Nu HTML validation — 0 messages.
- CSS validation — 0 errors/warnings for `layout.css` and `components.css`;
  `base.css` blocked by validator TLS failure.
- Asset audit — all 53 tracked production images are referenced; the only
  reported missing reference is the intentional inline SVG favicon data URI.
- Structural DOM check — one `h1`, no duplicate IDs, no empty links, all
  controls labelled, all form controls labelled, and no missing image `alt`.
- Static search — no `role="slider"` or `href="#"` in shipped source.
- Temporary browser QA — no console errors, no overflow, working carousel
  movement and pause states, and readable JavaScript-disabled fallback.

Local browser coverage includes Chrome 151 at 375, 430, 768, 1024, 1399,
1440, and 1920px plus Firefox 153 screenshots at 430px and 1920px. Brave
headless timed out with GPU/network errors; Safari automation required an
unavailable password; VoiceOver was not manually walked; previous browser
versions and physical iOS/Android devices were unavailable.
