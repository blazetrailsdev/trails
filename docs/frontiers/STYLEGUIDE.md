# Frontiers Style Guide

## Design Philosophy

Frontiers should feel like a **forest clearing** — calm, grounded, readable. The palette is earth and forest: warm browns for surfaces, moss green for accents, water blue for types and info, with restrained warm tones for warnings and errors.

**Do:**

- Use brown neutrals for 95% of the UI
- Use green for interactive elements (buttons, links, active states)
- Use blue for informational elements (types, links, badges)
- Keep text high-contrast and warm

**Don't:**

- Use pure black (#000) or pure white (#FFF)
- Use accent colors for large backgrounds
- Combine green and blue in adjacent elements
- Use saturated colors for body text

---

## Color Palette

### Dark Theme (default)

| Role            | Name      | Hex       | Contrast | Usage                            |
| --------------- | --------- | --------- | -------- | -------------------------------- |
| Surface         | Loam      | `#1C1916` | —        | Main background                  |
| Surface Raised  | Bark      | `#272320` | —        | Panels, sidebars, headers        |
| Surface Overlay | Driftwood | `#353029` | —        | Dropdowns, tooltips, code blocks |
| Border          | —         | `#4A433B` | —        | Dividers, input borders          |
| Border Focus    | Fern      | `#5A8A42` | —        | Focused inputs                   |
| Text            | Birch     | `#E4DED4` | 13.1:1   | Primary text                     |
| Text Muted      | Dust      | `#A59D91` | 6.5:1    | Secondary text, labels           |
| Accent          | Fern      | `#6B9E50` | 5.5:1    | Buttons, links, active states    |
| Accent Hover    | Canopy    | `#7DB060` | —        | Hover states                     |
| Info            | Creek     | `#5B96B5` | 5.4:1    | Types, informational badges      |
| Success         | Sage      | `#7DA668` | 6.3:1    | Success badges, "up" status      |
| Error           | Clay      | `#D0654E` | 4.7:1    | Errors, destructive actions      |
| Warning         | Honey     | `#D4A04A` | 7.4:1    | Warnings, highlights             |

### Light Theme

| Role            | Name       | Hex       | Contrast | Usage                  |
| --------------- | ---------- | --------- | -------- | ---------------------- |
| Surface         | Linen      | `#F3EEE8` | —        | Main background        |
| Surface Raised  | Paper      | `#FAF8F5` | —        | Panels, headers        |
| Surface Overlay | Sand       | `#EAE4DB` | —        | Dropdowns, code blocks |
| Border          | —          | `#CFC7BB` | —        | Dividers               |
| Text            | Charcoal   | `#2A2520` | 13.2:1   | Primary text           |
| Text Muted      | Walnut     | `#6B6055` | 5.3:1    | Secondary text         |
| Accent          | Deep Fern  | `#3D6E28` | 5.3:1    | Buttons, links         |
| Info            | Deep Creek | `#2E6B85` | 5.1:1    | Types, info            |
| Success         | Deep Moss  | `#3D6A2C` | 5.5:1    | Success states         |
| Error           | Brick      | `#A04030` | 5.6:1    | Errors                 |
| Warning         | Amber      | `#A07830` | —        | Warnings               |

All text colors pass WCAG AA (4.5:1+) on their respective backgrounds.

### Button Text

Primary buttons use `text-surface` (dark bg color) on accent backgrounds — not white.
This gives 5.5:1 contrast on green, compared to 3.2:1 for white.

---

## Typography

**Font:** JetBrains Mono / Fira Code / ui-monospace

| Element             | Size | Weight            | Color             |
| ------------------- | ---- | ----------------- | ----------------- |
| Page title          | 18px | Bold              | Accent            |
| CLI prompt          | 14px | Normal            | Accent ($ symbol) |
| Editor              | 13px | Normal            | Monaco theme      |
| Tab/button labels   | 12px | Normal/Medium     | Muted or Accent   |
| File tree items     | 11px | Normal            | Muted or Accent   |
| CLI output / badges | 10px | Normal/Medium     | Muted             |
| Dir labels          | 9px  | Medium, uppercase | Muted             |

### Mobile Typography

On screens below 768px, bump interactive text sizes for readability:

| Element           | Desktop | Mobile |
| ----------------- | ------- | ------ |
| Page title        | 18px    | 20px   |
| Tab/button labels | 12px    | 14px   |
| CLI output        | 10px    | 12px   |
| Body prose        | 14px    | 16px   |

---

## Responsive Layout

### Breakpoints

| Name | Width  | Usage                                    |
| ---- | ------ | ---------------------------------------- |
| sm   | 640px  | Single-column cards, stacked nav         |
| md   | 768px  | Tutorial layout switches to side-by-side |
| lg   | 1024px | Full sandbox IDE layout                  |

### Spacing Scale

Use consistent spacing derived from a 4px base:

| Token | Value | Usage                                  |
| ----- | ----- | -------------------------------------- |
| xs    | 4px   | Icon gaps, tight padding               |
| sm    | 8px   | Inline spacing, small gaps             |
| md    | 16px  | Card padding, section gaps             |
| lg    | 24px  | Page margins (mobile), between cards   |
| xl    | 32px  | Page margins (desktop), major sections |
| 2xl   | 48px  | Hero spacing, page-level separation    |

### Touch Targets

All interactive elements must meet 44x44px minimum tap area on mobile. Use padding to expand small elements — don't make the visible element larger than needed.

### Layout Patterns

**Landing page** (`/frontiers`):

- Desktop: 3-column card grid, feature showcase in 2-column layout
- Mobile (<768px): single-column stack, full-width cards

**Tutorial step page** (`/frontiers/learn/[tutorial]/[step]`):

- Desktop: two-column — scrollable content left, sandbox panes right
- Mobile (<768px): single-column — content on top, sandbox panes below as collapsible accordion sections
- Step navigation: sticky bottom bar on mobile, top breadcrumb on desktop

**Sandbox IDE** (`/frontiers/project`):

- Desktop only. Show a "best on desktop" notice below 768px.

**Code blocks and diffs:**

- Full-width on mobile with horizontal scroll
- Apply/Run buttons span full width on mobile

---

## Semantic Colors

| Meaning       | Dark            | Light                | Used For                     |
| ------------- | --------------- | -------------------- | ---------------------------- |
| Interactive   | Fern `#6B9E50`  | Deep Fern `#3D6E28`  | Buttons, active tabs, cursor |
| Informational | Creek `#5B96B5` | Deep Creek `#2E6B85` | Types, links, badges         |
| Positive      | Sage `#7DA668`  | Deep Moss `#3D6A2C`  | Success, "up" status         |
| Negative      | Clay `#D0654E`  | Brick `#A04030`      | Errors, destructive          |
| Caution       | Honey `#D4A04A` | Amber `#A07830`      | Warnings                     |

---

## Components

### Buttons

**Primary:** `bg-accent text-surface rounded px-3 py-1 text-xs font-medium`
**Secondary:** `border border-border text-text hover:border-accent hover:text-accent`
**Destructive:** `border border-border text-text-muted hover:border-error hover:text-error`
**Quick action:** `border border-border px-2 py-1 text-[10px] text-text-muted`

On mobile, primary and secondary buttons get `py-2.5` minimum for touch targets.

### Panels

- Main bg: implicit `bg-surface`
- Raised: `bg-surface-raised` (sidebars, headers)
- Overlay: `bg-surface-overlay` (dropdowns, code blocks)
- Borders: `border-border` (1px solid)

### Cards

Tutorial and feature cards use `bg-surface-raised` with `border-border`, `rounded-lg`, and `p-4` (desktop) / `p-3` (mobile). Hover state: `border-accent` transition.

### Monaco Syntax

| Token     | Dark             | Light                |
| --------- | ---------------- | -------------------- |
| Keywords  | Fern `#6B9E50`   | Deep Fern `#3D6E28`  |
| Strings   | Honey `#D4A04A`  | Amber `#A07830`      |
| Numbers   | Honey `#D4A04A`  | Amber `#A07830`      |
| Types     | Creek `#5B96B5`  | Deep Creek `#2E6B85` |
| Comments  | `#756D62` italic | `#756D62` italic     |
| Variables | Birch `#E4DED4`  | Charcoal `#2A2520`   |

---

## Motion

- Splitter hover: opacity 0.15s
- Tab switch: transition-colors 150ms
- Spinner: `animate-spin border-accent border-t-transparent`
- Accordion expand/collapse: max-height 200ms ease-out
- No other animations

---

## Accessibility

### Target

WCAG 2.1 AA compliance. Not AAA — the earth-tone palette makes AAA impractical for accent colors without losing the visual identity.

### Color Contrast

Already covered above — all text/background pairs meet 4.5:1. Non-text elements (icons, borders, focus rings) must meet 3:1 against their background.

### Keyboard Navigation

- All interactive elements must be reachable via Tab in logical order
- Visible focus indicator: 2px `border-focus` (Fern) outline with 2px offset. Never remove outlines without replacing them.
- Tutorial step navigation: arrow keys for prev/next step, Escape to close accordion panes on mobile
- Modal dialogs (CommandPalette, ConfirmDialog): trap focus while open, restore on close
- Monaco editor handles its own keyboard nav — don't interfere

### Screen Readers

- Tutorial prose sections: use semantic HTML (`<h2>`, `<p>`, `<ol>`, `<code>`) — not divs with classes
- CLI output: wrap in `role="log"` with `aria-live="polite"` so new output is announced without interrupting
- Checkpoint results: `aria-live="assertive"` for pass/fail announcements
- Accordion panes on mobile: `aria-expanded`, `aria-controls`, proper `button` triggers
- Step navigation: `aria-current="step"` on the active dot
- Diagrams (Mermaid): include `aria-label` with a text description of the diagram. Content authors must provide this in the step definition.

### Reduced Motion

Respect `prefers-reduced-motion: reduce`:

- Disable accordion animations
- Disable splitter hover transitions
- Keep spinner (functional, not decorative) but slow it to 2s

### Skip Links

Add a "Skip to tutorial content" link as the first focusable element on the step page — keyboard users shouldn't have to tab through the entire sandbox nav to reach the prose.

---

## Naming

Colors are named after natural elements — forest, earth, water:

- **Surfaces:** Loam, Bark, Driftwood, Linen, Paper, Sand
- **Text:** Birch, Dust, Charcoal, Walnut
- **Green:** Fern, Canopy, Sage, Moss
- **Blue:** Creek
- **Warm:** Honey, Clay, Brick, Amber
