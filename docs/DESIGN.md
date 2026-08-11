# Handoff: QoS Staff Dashboard (new-tab style link start page)

## Overview
An internal start page for Queen of the South FC staff: a browser-new-tab-style dashboard of links to the tools staff use daily (password manager, back office till manager, stock manager, invoicing, etc.). Users can search their links or the web, pin favourites, see recently opened links, add/edit/delete links, drag to reorder, switch between two layouts and two card sizes, and toggle light/dark. Each link tile has its own logo image slot (fill/contain). All state persists locally per browser.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype of the intended look and behaviour, not production code to copy verbatim. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, Svelte, native, etc.) using its established patterns, component library and state conventions. If no app environment exists yet, pick the most appropriate framework and implement it there. The bundled `.dc.html` file uses a proprietary streaming-template runtime; read it for structure and exact values, don't port the runtime.

## Fidelity
**High-fidelity.** Colours, typography, spacing, radii, shadows and interactions are final. Recreate pixel-perfectly using the codebase's own primitives.

## Screens / Views

### 1. Dashboard (single screen, two layout modes)
**Purpose:** launch a tool in one click or keystroke; manage the link set.

**Page shell**
- Full viewport min-height. Background: `radial-gradient(1200px 600px at 50% -280px, var(--bg2), var(--bg) 70%)`.
- Padding `34px 32px 72px`. Inner container `max-width: 1180px; margin: 0 auto`, vertical flex, `gap: 28px`.
- Font family: `Barlow` (400/500/600/700) for body/UI; `Barlow Condensed` (600/700) for eyebrow + section labels + tile monograms. Google Fonts.

**Header** (flex row, `align-items:center`, `gap:18px`)
- Crest: `56×56`, `border-radius:50%`, white background, `--shadow`. Asset: `assets/qos-crest.png`.
- Text block (`margin-right:auto`, column, `gap:2px`):
  - Eyebrow: "QUEEN OF THE SOUTH FC" — Barlow Condensed 700, `13px`, `letter-spacing:.18em`, uppercase, `var(--navy)`.
  - Title: "{Good morning|Good afternoon|Good evening}, Doonhamers" — Barlow 700, `26px`, `letter-spacing:-.01em`, `line-height:1.1`. Greeting from local hour: `<12` morning, `<18` afternoon, else evening.
- Right controls (flex, `gap:10px`):
  - Layout segmented control: pill container `background:var(--surface)`, `1px solid var(--line)`, `border-radius:999px`, `padding:4px`, `--shadow`. Two buttons "Grouped" / "Compact": `padding:7px 15px`, `font-size:13px`, weight 600, `border-radius:999px`; active = `background:var(--navy)`, `color:#fff`; inactive = transparent, `color:var(--text-dim)`.
  - Theme toggle: `40×40` circle, `1px solid var(--line)`, `background:var(--surface)`; glyph `☾` in light mode, `☀` in dark. Hover: `border-color:var(--line-strong)`.
  - Primary button "＋ Add link": height `40px`, `padding:0 18px`, `border-radius:999px`, `background:var(--navy)`, `#fff`, `14px/600`. Hover `background:var(--navy-soft)`.

**Card size** (config-driven, see Design Tokens → Card size presets): `compact` / `comfortable` (default) / `large` scale the grid column minimum, gaps, radii, per-card logo height, badge/dot sizes and name/host font sizes uniformly across pinned tiles, grouped cards and compact rows.

**Per-link logo** — every tile carries its own logo image (a drag-and-drop image placeholder in the prototype; wire it to an uploaded/fetched logo or favicon in the real build). A global `logoFit` setting (`cover` fills the frame and crops; `contain`, the default, keeps the whole logo visible and letterboxes) applies to all logos at once.
- Grouped cards: logo fills the full card width at the top (rounded top corners only, height per size preset — 88/116/152px), name + host sit below with horizontal padding matching the size preset.
- Pinned tiles / compact rows: logo is a small rounded square to the left of the name (badge-sized / badge-size-minus-8px respectively).

**Search bar**
- Row, height `60px`, `background:var(--surface)`, `1px solid var(--line)`, `border-radius:16px`, `padding:0 18px`, `gap:14px`, `--shadow`.
- Leading glyph `⌕` at `19px`, `var(--text-dim)`.
- Input: borderless, transparent, `17px/500`, placeholder "Search your links, or press ↵ to search the web".
- Trailing hint chip: `1px solid var(--line)`, `border-radius:8px`, `padding:5px 9px`, `12px/600`, `letter-spacing:.06em`, uppercase, `var(--text-dim)`. Reads "Web search ↵" when empty, otherwise "N match/matches".

**Pinned section** (hidden when query non-empty or no pinned links)
- Header row: label "PINNED" (Barlow Condensed 700, `14px`, `.16em`, uppercase, `var(--text-dim)`) + sub-note "Your most-used tools" (`13px`, `var(--text-dim)`).
- Grid `repeat(auto-fill, minmax(206px, 1fr))`, `gap:14px`.
- Tile = anchor, row, `gap` per size preset, `background:var(--tile)`, `1px solid var(--line)`, `border-radius` per preset, `padding` per preset, `--shadow`. Hover: `translateY(-3px)`, `--shadow-lift`, `border-color:var(--line-strong)`; transition `.16s ease` on transform/box-shadow/border-color.
- Logo slot (rounded square, badge-sized) + name/host (sizes per preset, ellipsis).

**Recent row** (hidden when query non-empty or no recents; max 6, most recent first)
- Wrapping flex, `gap:9px`. Label "RECENT" same treatment as section labels.
- Chip = anchor: `background:var(--surface)`, `1px solid var(--line)`, `border-radius:999px`, `padding:7px 14px 7px 9px`, `13px/600`, with a `9×9` `border-radius:3px` accent dot. Hover: `border-color:var(--line-strong)`, `color:var(--navy)`.

**Grouped layout (default)**
- Column of sections, `gap:30px`.
- Section head: group name (Barlow Condensed 700, `14px`, `.16em`, uppercase, `var(--navy)`) + `1px` `var(--line)` rule filling remaining width + count (`12px/600`, `var(--text-dim)`).
- Grid `repeat(auto-fill, minmax({sizeGrid}px, 1fr))`, `gap:{sizeGap}px` — see size presets.
- Card: `background:var(--tile)`, `1px solid var(--line)`, `border-radius` per preset, `--shadow`, same hover lift. Full-width logo slot at the top (rounded top corners only, height per preset), then name (`letter-spacing:-.005em`) and host, both ellipsised, sized per preset with matching horizontal text padding.
- Card actions, absolutely positioned `top:11px; right:11px`, `gap:4px`: pin `★` and edit `✎`, each `26×26`, `border-radius:8px`, transparent, `12–13px`. Pin: `var(--navy)` at opacity 1 when pinned, else `var(--text-dim)` at `.5`. Edit hover: opacity 1, `background:var(--surface2)`.

**Compact layout**
- Grid `repeat(auto-fill, minmax(320px, 1fr))`, `gap:14px` of group panels.
- Panel: `background:var(--surface)`, `1px solid var(--line)`, `border-radius:18px`, `--shadow`, `padding:6px 6px 8px`; head `padding:13px 14px 11px` with `13.5px` group label + rule + count.
- Row: `border-radius:12px`, hover `background:var(--surface2)`. Anchor `padding:10px 8px 10px 10px`, `gap:12px`: accent dot, name (`14.5px/600`, ellipsis), host right-aligned (`12px`, `var(--text-dim)`, `max-width:44%`). Pin/edit buttons at the row end.

**Empty state** (links exist but none match the query)
- Centred block, `padding:70px 20px`, `1px dashed var(--line-strong)`, `border-radius:20px`. Line 1 `17px/600` `var(--text)`: `Nothing matches “{query}”`. Line 2 `14px` `var(--text-dim)`: "Press ↵ to search the web instead."

**Footer**
- Row, `12.5px`, `var(--text-dim)`: "Drag a tile to reorder · ★ to pin · saved in this browser", `1px` rule, then an underlined text button "Reset to defaults" (hover `var(--navy)`).

### 2. Add / Edit link modal
- Overlay: `position:fixed; inset:0`, `background:rgba(12,19,48,.55)`, `backdrop-filter:blur(3px)`, centred, `padding:24px`, `z-index:50`. Click on overlay closes; clicks inside do not propagate.
- Dialog: `max-width:440px`, `background:var(--surface)`, `1px solid var(--line)`, `border-radius:20px`, `--shadow-lift`, `padding:24px`.
- Title `19px/700` — "Add a link" or "Edit link". Close `✕` button `30×30`, `border-radius:9px`, `background:var(--surface2)`.
- Three fields (Name, URL, Group), column `gap:14px`. Field label: `12px/700`, `letter-spacing:.1em`, uppercase, `var(--text-dim)`. Input: `1px solid var(--line)`, `background:var(--surface2)`, `border-radius:11px`, `padding:11px 13px`, `15px/500`. Placeholders: "Stock Manager", "https://…", "Operations". Group field offers existing group names as suggestions.
- Footer actions (height `42px`, `border-radius:11px`): "Delete" (edit mode only, left-aligned, text `#C2415A`, hover border `#C2415A`), spacer, "Cancel" (outlined), "Save" (`background:var(--navy)`, `#fff`, hover `var(--navy-soft)`).

## Interactions & Behavior
- **Open link:** all link tiles/rows/chips are `<a target="_blank" rel="noopener">`. Clicking also pushes the link id to the front of `recents` (dedup, cap 6) and persists.
- **Search:** filters by name, URL or group, case-insensitive substring. Grouping recomputes over matches; Pinned and Recent sections hide while a query is active. `Enter` opens the first match (and records it as recent); if there are no matches, opens `https://www.google.com/search?q={query}` in a new tab.
- **Pin:** `★` toggles `fav`; pinned links appear in Pinned (they remain in their group too). `preventDefault` + `stopPropagation` so the anchor doesn't navigate.
- **Edit / delete:** `✎` opens the modal prefilled. Save validates non-empty name + URL and prepends `https://` when the scheme is missing; empty group falls back to "Other". Delete removes the link and any recents entry.
- **Drag to reorder:** tiles and compact rows are `draggable`. On drop, the dragged link is spliced to the target's index and inherits the target's group — dragging across group boundaries recategorises it. `dragover` must `preventDefault`.
- **Layout toggle:** Grouped ⇄ Compact, persisted.
- **Theme toggle:** light ⇄ dark by swapping the CSS custom properties on the root wrapper (`data-theme="dark"`), persisted. No transition on the swap.
- **Hover motion:** tiles lift `-3px` with the deeper shadow, `160ms ease`.
- **Responsive:** all grids are `auto-fill minmax(...)`; the design targets desktop browsers but reflows down to a single column without changes.

## State Management
Single client-side store, persisted to `localStorage` under key `qos-dash-v1` as `{ links, recents, theme, layout }`.
- `links: { id, name, url, group, fav? }[]` — order is the user's drag order; grouping is derived by first-appearance of `group`.
- `recents: string[]` — link ids, most recent first, max 6.
- `theme: 'light' | 'dark'`, `layout: 'grouped' | 'compact'`, `cardSize: 'compact' | 'comfortable' | 'large'`, `logoFit: 'cover' | 'contain'` (the latter two are global display settings, not per-link data).
- Ephemeral (not persisted): `query`, `modalOpen`, `editId`, `draft {name,url,group}`, current drag id.
- On mount: read storage; if absent, seed with the default link set below. Every mutation writes the whole store back.
- No network/data fetching. Derived per render: `host` (hostname minus `www.`), `initials` (first letters of the first two words, uppercased), accent hue (see below).

## Design Tokens

**Brand**
| Token | Value |
| --- | --- |
| `--navy` | `#1D2C69` (sampled from the club crest) |
| `--navy-deep` | `#131E4A` |
| `--navy-soft` | `#3A4C96` |

**Light theme**
`--bg #F4F6FB` · `--bg2 #EAEEF7` · `--surface #FFFFFF` · `--surface2 #F8FAFD` · `--tile #FFFFFF` · `--text #12193A` · `--text-dim #5C6588` · `--line #E1E6F2` · `--line-strong #CFD6E9`

**Dark theme** (`--navy` becomes `#5A73D6`, `--navy-soft` `#8DA0EA`)
`--bg #0C1330` · `--bg2 #111A3D` · `--surface #151F45` · `--surface2 #1B2653` · `--tile #182352` · `--text #EEF1FA` · `--text-dim #95A0C6` · `--line #26325E` · `--line-strong #35426F`

**Shadows**
- `--shadow` light: `0 1px 2px rgba(19,30,74,.06), 0 8px 24px rgba(19,30,74,.07)`; dark: `0 1px 2px rgba(0,0,0,.35), 0 10px 30px rgba(0,0,0,.35)`
- `--shadow-lift` light: `0 2px 6px rgba(19,30,74,.10), 0 18px 40px rgba(19,30,74,.16)`; dark: `0 2px 8px rgba(0,0,0,.45), 0 22px 48px rgba(0,0,0,.5)`

**Per-link accent** — deterministic from the link name: hash the name, pick from hues `[258, 232, 212, 282, 196, 244]`, then
- badge: `38×38`, `border-radius:11px`, text `oklch(0.42 0.14 H)`, background `oklch(0.93 0.045 H)`, border `1px solid oklch(0.87 0.06 H)`, Barlow Condensed 700 `16px`
- dot: `9×9`, `border-radius:3px`, `oklch(0.58 0.15 H)`

**Card size presets** (`cardSize`: compact / comfortable [default] / large)
| | grid min | gap | radius | card pad | badge | name | host | logo height |
|---|---|---|---|---|---|---|---|---|
| compact | 180px | 10px | 14px | 12/12/11px | 32px | 13.5px | 11.5px | 88px |
| comfortable | 230px | 14px | 18px | 17/17/15px | 38px | 16px | 12.5px | 116px |
| large | 300px | 18px | 20px | 24/24/20px | 52px | 19px | 14px | 152px |

**Radii** `8` (icon buttons) · `9–14` (badge/logo slot, inputs, modal buttons, scales with card size) · `12` (compact row) · `14–20` (card, panel, scales with card size) · `16` (search, pinned tile) · `20` (modal, empty state) · `999` (pills)

**Spacing scale** `2, 4, 6, 9, 10, 12, 14, 18, 22, 28, 30, 34` px

**Type scale** `12 / 12.5 / 13 / 13.5 / 14 / 14.5 / 15 / 16 / 17 / 19 / 26` px; weights 400/500/600/700; uppercase labels use `letter-spacing .1–.18em`.

## Default link set (seed data)
Operations: Password Manager `vault.qosfc.com` (pinned) · Back Office Till Manager `backoffice.qosfc.com` (pinned) · Stock Manager `stock.qosfc.com` (pinned) · Invoicing `invoicing.qosfc.com` (pinned) · Rota & Shifts `rota.qosfc.com`
Matchday: Ticketing Admin · Hospitality Bookings · Stadium Access Control · Matchday Programme CMS
Comms & Media: Club Website CMS `qosfc.com/wp-admin` · Club Shop Admin · Mailing List · Social Scheduler
Admin & Finance: Staff Email · Shared Drive · Accounts · HMRC Gateway · Companies House
League & Football: SPFL Club Portal · Scottish FA Portal

⚠️ Only the four Operations tools the client named are real requirements; the remaining URLs are plausible placeholders on `*.qosfc.com` and must be replaced with the club's actual endpoints before shipping.

## Assets
- `assets/qos-crest.png` — Queen of the South FC crest, supplied by the client (240×240 PNG), used only in the header.
- Per-link logos are empty placeholders in the prototype (a drag-and-drop image slot component) — no real logo assets are bundled. Source real tool logos/favicons before shipping, and decide a fallback (e.g. the monogram badge used earlier in this file's revision history) for links with none.
- Icons are text glyphs (`⌕ ★ ✎ ✕ ☾ ☀ ＋ ↵`). Swap for the codebase's icon set (search, star, pencil, close, moon, sun, plus) when implementing.
- Fonts: Barlow and Barlow Condensed from Google Fonts (weights 400–700).

## Files
- `QoS Staff Dashboard.dc.html` — the full design: markup with all inline styles, the theme custom properties, and the logic class holding state, persistence, search, pin, drag-reorder and CRUD.
- `assets/qos-crest.png` — crest asset.
