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

These are all stored in that browser — until you publish them.

### "Save for everyone"

Arrange the dashboard how you want it — add, edit, delete, pin, drag, recolour,
set logos — then press **Save for everyone** in the footer. Your current tiles
become the shared set: the server rewrites `config/links.json` and bumps its
`version`, and every other browser adopts it on its next load.

**Your edits are not lost — they are exactly what gets published.** Other
people's local changes *are* replaced, which is the point; the confirmation
says so before anything is written.

Notes:

- Logos stored **only in a browser** (the `indexeddb` driver, shown as
  `store:…`) can't be shared — the dialog lists them and they're left out. With
  the `combinedstorage` driver logos are real URLs, so they publish fine.
- Links without a scheme are normalised (`stock.qosfc.com` →
  `https://stock.qosfc.com`); anything that isn't a web address is refused and
  reported rather than silently dropped.
- The file stays hand-editable. Editing it directly still works — just bump
  `version` yourself.
- Uploads and publishing are both unauthenticated by default. Set `PUBLISH_KEY`
  on the uploader service to require a shared secret for publishing.

## Logo uploads (Combined Storage)

You can put a real logo on any tile, four ways — no need to save an image file
first:

1. **Use the site's own logo** — press *"⤓ Use the site's own logo"* in **✎ Edit**
   and the server fetches the page the link points at, taking its `og:image`
   (the sharing preview), else `apple-touch-icon`, else `favicon`.
2. **Paste a screenshot** — take one with `Win`+`Shift`+`S` (or `Cmd`+`Shift`+`4`)
   and press `Ctrl`+`V` in the Edit dialog.
3. **Snapshot a window** — *"⛶ Snapshot a window"* lets you pick any open window
   or tab and grabs a frame. Because browsers only allow screen capture on a
   **secure context**, this button appears only when the dashboard is served over
   `https://` (or opened at `localhost`); over plain `http://` on a LAN address it
   is hidden.
4. **Drag or choose an image** — drag one onto a tile, or onto the logo slot in
   **✎ Edit**.

Images are downscaled in the browser (longest edge 512px by default) before being
stored.

> A true rendered screenshot of a *page* would need a headless browser on the
> server (~400MB of Chromium) and, for the login-gated tools here, would only
> ever capture a login form — which is why options 1–3 exist instead. Ask if you
> want the headless option adding for public sites.

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
CS_USERNAME=admin
CS_PASSWORD=…
CS_PARENT_ID=root      # folder id to upload into
CS_NETWORK=…           # only if Combined Storage's Docker network is named differently
```

The uploader **joins Combined Storage's own Docker network** and reaches it by
container name, so `CS_BASE_URL` defaults to `http://combinedstorage:4000` and
normally needs no value. That network must already exist — check the name with
`docker network ls` (the stack expects `cloudflared-combinedstorage_default`)
and set `CS_NETWORK` if yours differs.

> **`CS_BASE_URL` is an internal address, never the public one.** If
> `cdn.example.com` is served by a Cloudflare Tunnel or reverse proxy it answers
> on 443 only, so `https://cdn.example.com:4000` times out from inside a
> container even though it loads fine in your browser. The uploader warns about
> that combination at startup.

Not sharing a network? `CS_BASE_URL=http://host.docker.internal:4000` works too,
since the stack maps that name to the Docker host.

This does not change what staff see: Combined Storage builds the `/f/<token>`
links from its own `PUBLIC_BASE_URL`, so uploading over the internal address
still returns the public URL.

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

## Two views: staff and public

The container serves the same dashboard on two ports:

| | Port | What you get |
| --- | --- | --- |
| **Staff** | `1919` | Everything: add/edit/delete, pin, drag, colours, logo uploads, **Save for everyone** |
| **Public** | `1920` | **Read-only.** The same links, search, layouts, card sizes and light/dark — no editing of any kind |

Read-only is enforced by the server, not just hidden in the page: on the public
port `/publish`, `/upload` and `/grab` return **403**, whatever the browser
tries. That's what makes `1920` the port to expose through a tunnel or reverse
proxy while the staff view has no login.

Both views read the same `config/links.json`, so publishing from the staff view
updates the public one too.

## Run it

### Docker Compose (recommended — live-editable links)

```bash
docker compose up -d --build
```

Staff view on **http://localhost:1919**, read-only public view on
**http://localhost:1920**. `config/` is mounted from the host, so edits there
(and anything published from the staff view) show up on both.

### Plain Docker

```bash
docker build -t qos-staff-dashboard .
docker run -d -p 1919:80 -p 1920:8080 --name qos-dashboard qos-staff-dashboard
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
nginx.conf               Two server blocks: :80 staff (editable), :8080 public.
nginx-app.conf           Static serving shared by both, so they cannot drift.
storage.js               Pluggable logo storage (combinedstorage/indexeddb/http).
uploader/                Sidecar holding Combined Storage credentials.
config/links.json        Shared, manually-edited link set (source of truth).
config/storage.json      Which storage driver uploads use.
assets/qos-crest.png     Club crest.
nginx.conf               Serves the site; no-cache for index.html + links.json.
Dockerfile               nginx:alpine image.
docker-compose.yml       Runs staff on :1919 and public on :1920.
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
