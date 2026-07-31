# QoS Staff Dashboard

An internal new-tab-style start page for Queen of the South FC staff — a dashboard
of links to the tools staff use daily (password manager, back-office till manager,
stock manager, invoicing, etc.). Search links or the web, pin favourites, see
recently opened links, switch between **Grouped** and **Compact** layouts, and
toggle **light/dark**.

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
{ "name": "Stock Manager", "url": "https://stock.qosfc.com", "group": "Operations", "fav": true }
```

- `name`, `url`, `group` — required. Links are shown under their `group` heading,
  in file order.
- `fav` — optional; `true` puts the link in the **Pinned** row at the top.

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
config/links.json        Shared, manually-edited link set (source of truth).
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
