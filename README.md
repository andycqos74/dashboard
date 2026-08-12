# QoS Staff Dashboard

An internal new-tab-style start page for Queen of the South FC staff — a dashboard
of links to the tools staff use daily (password manager, back-office till manager,
stock manager, invoicing, etc.). Search links or the web, pin favourites, see
recently opened links, drag tiles to reorder, collapse groups, edit each tile's
logo, colour and icon, switch between **Grouped** and **Compact** layouts, pick a
**card size** (S/M/L), and toggle **light/dark**.

Built as a static site (vanilla HTML/CSS/JS, no build step, no framework) that
faithfully recreates the supplied design. Hosted on Docker via nginx. **No login** —
every visitor sees the same shared set of links and tiles.

## How links work (manual updates for now)

All tiles come from a single shared file: **`config/links.json`**. Everyone who
opens the dashboard sees exactly what's in that file — there's no database and no
per-user accounts.

To change the links for **all** users:

1. Edit `config/links.json`.
2. Bump the `"version"` number by 1 (e.g. `1` → `2`).
3. Save. If running via `docker-compose` the file is mounted live, so just
   reload the page — no rebuild needed. (If you baked it into the image with a
   plain `docker build`, rebuild and restart.)

Each link entry:

```json
{ "name": "Stock Manager", "url": "https://stock.qosfc.com", "group": "Operations",
  "fav": true, "logo": "assets/logos/stock.png", "icon": "onedrive", "color": "#E4002B" }
```

- `name`, `url`, `group` — required. Links are shown under their `group` heading,
  in file order.
- `fav` — optional; `true` puts the link in the **Pinned** row at the top.
- `logo` — optional image for the tile's logo slot (a full-width banner on grouped
  cards, a small square on pinned tiles and compact rows). Either a URL
  (`assets/logos/xero.png`, or a Combined Storage `/f/<token>` link), or a
  `store:<id>` key produced by uploading through the UI. If it's missing or fails
  to load, the tile falls back to `icon`, then to the link's initials.
- `icon` — optional. A **brand key** (`google`, `gmail`, `drive`, `docs`,
  `microsoft`, `onedrive`, `outlook`, `amazon`, `xero`, `wix`, `dropbox`,
  `postoffice`, `globe`), an **emoji** (e.g. `"🛒"`), or an **image URL**. Omit it
  and the dashboard **auto-detects** an icon from the URL/name (Google, OneDrive,
  Xero, …); if it can't, it falls back to the name's initials.
- `color` — optional hex accent for the tile's badge/dot (e.g. `"#E4002B"`). Omit
  for an automatic colour derived from the name.

### Interacting with tiles (per-browser)

- **Drag** a tile onto another to reorder; dropping it into a different group
  recategorises it.
- Click a group's **chevron / heading** to collapse or expand that category.
- **✎ Edit** a tile to change its name, URL, group, **logo**, **icon** and
  **colour**; **★** pins it.
- **S / M / L** in the header switches card size (compact / comfortable / large) —
  it scales the grid, logo height, radii and type together.
- **Logos: contain / cover** in the footer controls how logo images fill their
  slot: `contain` shows the whole logo letterboxed, `cover` fills and crops.

These are all stored in that browser. To change things for **everyone**, edit
`config/links.json` (and bump `version`).

## Logo uploads (Combined Storage)

You can put a real logo on any tile: **drag an image straight onto the tile**, or
open **✎ Edit** and drop/click the logo slot. Images are downscaled in the browser
(longest edge 512px by default) before being stored.

Where those uploads live is a config choice — `config/storage.json` picks a
driver, so swapping backends never means changing code:

| driver | uploads go to | shared between staff? |
| --- | --- | --- |
| `combinedstorage` *(default)* | [Combined Storage](https://github.com/andycqos74/combinedstorage) via the `uploader` service | **Yes** |
| `indexeddb` | the visitor's own browser, no backend needed | No |
| `http` | any endpoint returning `{"url":…}` or `{"key":…}` | Yes |
| `none` | uploads disabled (`logo` URLs still work) | — |

### How the Combined Storage path works

Combined Storage gates its whole `/api/*` behind an admin session, but a browser
can't keep a secret — shipping the admin password to every staff PC would hand
them the entire file manager. So the stack includes a small **`uploader`**
sidecar that holds the credentials and exposes exactly one unauthenticated
operation on the internal network:

```
browser → POST /upload (nginx, same-origin) → uploader → Combined Storage /api/files/{folder}/upload
                                                       ← { url: "https://…/f/<token>" }
```

Combined Storage answers with a **stable public `/f/<token>` URL** that needs no
auth to read, and that URL is what gets saved as the link's `logo` — so every
visitor sees the same logo, and the images are managed (renamed, moved, deleted)
in Combined Storage's own file manager.

Set these on the stack (Portainer → Environment variables, or a `.env` beside
`docker-compose.yml`):

```
CS_BASE_URL=https://file.example.com:4000   # your Combined Storage instance
CS_USERNAME=admin
CS_PASSWORD=…
CS_PARENT_ID=root                           # folder id to upload into
CS_INSECURE_TLS=0                           # 1 only for a self-signed cert on a trusted LAN
```

Leave them unset and the dashboard still runs — `/upload` just returns a clear
"not configured" error. Uploads are **unauthenticated by design** (matching the
dashboard's no-login model), so keep the stack on an internal network; the
`uploader` port is deliberately not published to the host, and only `POST
/upload` with an `image/*` body is accepted, capped at 8MB.

Bumping `version` is what makes returning browsers pick up the new set. Without a
bump, a browser that has already cached its copy keeps showing the old links until
someone clicks **Reset to defaults**.

> ⚠️ Only the four Operations tools the client named are real requirements. The
> rest are plausible placeholders on `*.qosfc.com` — replace them with the club's
> actual endpoints before going live.

### What's shared vs. per-browser

- **Shared (everyone sees the same):** the link set, groups, and default pins from
  `config/links.json`.
- **Per-browser convenience only:** theme (light/dark), layout (grouped/compact),
  recently opened links, and any local pin/edit/add/drag changes a user makes.
  These live in that browser's `localStorage` and don't affect anyone else. **Reset
  to defaults** re-pulls the shared config and clears local changes.

## Run it

### Docker Compose (recommended — live-editable links)

```bash
docker compose up -d --build
```

Open **http://localhost:8080**. `config/links.json` is mounted read-only into the
container, so you can edit it on the host and reload the page.

### Plain Docker

```bash
docker build -t qos-staff-dashboard .
docker run -d -p 8080:80 --name qos-dashboard qos-staff-dashboard
```

(Editing links this way requires an image rebuild, or mount the file:
`-v "$PWD/config/links.json:/usr/share/nginx/html/config/links.json:ro"`.)

### Portainer

Deploy as a Portainer stack (`portainer-stack.yml`) — full step-by-step in
[`docs/PORTAINER.md`](docs/PORTAINER.md). The short version: **Stacks → Add stack →
Repository**, point it at this repo, Compose path `portainer-stack.yml`, deploy.

### Local preview without Docker

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. (A static server is needed rather than opening
`index.html` directly, because the app `fetch`es `config/links.json`.)

## Project layout

```
index.html               The whole app — markup, styles, and logic.
storage.js               Pluggable logo storage (combinedstorage/indexeddb/http).
uploader/                Sidecar holding Combined Storage credentials.
config/links.json        Shared, manually-edited link set (source of truth).
config/storage.json      Which storage driver uploads use.
assets/qos-crest.png     Club crest.
nginx.conf               Serves the site; no-cache for index.html + links.json.
Dockerfile               nginx:alpine image.
docker-compose.yml       Runs it on :8080 with links.json mounted live.
portainer-stack.yml      Portainer stack (Repository build method).
design-reference.dc.html Original design prototype (reference only).
docs/DESIGN.md           Full design handoff: tokens, screens, behaviour.
```

## Notes

- Fonts (Barlow / Barlow Condensed) load from Google Fonts. On a network with no
  outbound access they fall back to the system sans-serif — layout is unaffected.
- Icons are text glyphs (`⌕ ★ ✎ ✕ ☾ ☀ + ↵`), matching the design.
- Colours, spacing, radii, shadows and the per-link accent hues are taken verbatim
  from the design tokens.
