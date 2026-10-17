# Velvet Volute — design system (master)

> Source of truth for velvetvolute.ca. When a page needs an exception, say so in that page's own stylesheet; there are no page override files.
> Rewritten 2026-10-17 after the Task 3 design review. The earlier generated version (light ground, Montserrat, "Liquid Glass") never matched the site and was retired.

## Identity in one line
Deep wine and gold, dark ground, editorial layout, real product photography on a merlot table. Never a light background.

## Colour

| Role | Hex | Where |
| --- | --- | --- |
| Ground (merlot) | `#4A0E1E` | page background |
| Deep merlot | `#2C0610` | header, footer bands, full-width dark sections, selected states on camel |
| Deeper | `#22050C` | footer |
| Glow | `#6E1A31` | hero radial only |
| Camel | `#A07B52` | cards, panels, tiles, dialogs (the only light surface) |
| Gold | `#B5946A` | text on merlot, rules, icons |
| Gold light | `#E2C38F` / `#CDB08A` | primary buttons, headings on merlot |
| Ink on merlot | `#E8D3B4` | body text on dark ground |
| Ink on camel | `#330A14` (muted `#330A14` at 90%) | text on camel; `#2C0610` for labels |

Contrast floors: 4.5:1 for all text. Pale gold on camel is not allowed (1.9:1). Brand labels on camel use `#2C0610` (5.8:1).

## Type
- Headings and story copy: **Cormorant Garamond** (400/500/600, italic 400/500).
- Interface and body: **Jost** (300/400/500/600).
- Two families only. No Lora, no monospace.
- Scale: 16–17 px body (1.5–1.75), 12.5–14 px small labels, 24–32 px section headings, 46 px page titles, hero up to 100 px. Sentence case for labels; caps only on buttons and the top bar.

## Surfaces and lines
- Surfaces are flat colour, separated by a tone step. No gradients (the hero glow and the photo scrim are the exceptions), no shadows on anything at rest. Shadows only on the cart drawer, the Sherpa dialog and the floating pill.
- No hairline dividers, no 1 px outlined boxes. Buttons and chips are filled (`rgba(44,6,16,.10)` on camel; `#4A0E1E` when selected).
- Corners: 4 px on panels and tiles, fully round on pills and chips.

## Banned (tells)
Eyebrow/kicker labels above headings (the zodiac block's spaced-caps heading is a heading, not an eyebrow); 01/02/03 step numbers; tiny tracked-caps labels; emoji or ✦ as ornament (use the VV monogram); icon-topped feature cards; glass/blur panels; green or any colour outside the palette for states.

## Components
- Product card: photo strip (classic / luxury / roll-on, swipe), brand · for him/unisex in sentence case, name, story in Cormorant italic, "Read the story", vial tabs, filled size buttons, price + merlot ADD TO CART ("Added" in deep merlot). Cards take their natural height.
- Tiles (houses, scents, collections): camel, flat, photo on top where one exists, name band below.
- Navigation: wordmark, six links, cart pill; compact under 1560 px; one scrollable row on phones. Links stay visible on phones.
- Scent Sherpa: floating gold pill (collapses to the compass on phones after the hero), camel dialog that fits the viewport with Back/Next kept in view, picks shown with a 72 px photo.
- Footer: deep merlot, two columns, identical on every page.

## Motion
Subtle: 150–350 ms ease-out; transforms and opacity only; `prefers-reduced-motion` honoured.

## Checks before any deploy
`node .claude/skills/design-taste-frontend/scripts/lint.mjs index.html about.html how-it-works.html pages.css` and `inspect.mjs` on the home, a product page and /houses/; contrast 4.5:1; no horizontal scroll at 1440 and 390; Sherpa and cart flows in headless Chromium.
