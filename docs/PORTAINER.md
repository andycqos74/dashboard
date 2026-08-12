# Deploying on Portainer

The dashboard ships as a stack file, `portainer-stack.yml`. Because the image is
built from this repo's `Dockerfile` and the links are baked in from
`config/links.json`, the cleanest path is Portainer's **Repository** method — it
clones the repo and builds for you.

## Option A — Repository stack (recommended)

1. Portainer → **Stacks** → **Add stack**.
2. Name it e.g. `qos-dashboard`.
3. Build method: **Repository**.
4. Fill in:
   - **Repository URL:** this repository's URL
   - **Repository reference:** `refs/heads/main` (or
     `refs/heads/claude/claude-design-dashboard-e1ov1g` before it's merged)
   - **Compose path:** `portainer-stack.yml`
   - If the repo is private, add your Git credentials / a personal access token.
5. (Optional) **Environment variables** → add `DASHBOARD_PORT` if you don't want
   the default `1919`, plus the `CS_*` variables below to enable logo uploads.
6. **Deploy the stack.**

Portainer builds the image and starts the container. Open
`http://<docker-host>:8080`.

### Updating links later

The links live in `config/links.json` in the repo (bump its `"version"` when you
change them). To publish a change:

1. Commit the edited `config/links.json` to the branch Portainer tracks.
2. In Portainer, open the stack → **Pull and redeploy** (tick *re-pull image* /
   *re-build*).

Prefer hands-off updates? Enable **GitOps updates / automatic redeployment** (or a
webhook) on the stack so Portainer redeploys whenever the branch changes.

## Option B — Web-editor stack (needs a prebuilt image)

Portainer's **Web editor** can't build from a Dockerfile — it needs an image from a
registry. If you publish one (e.g. `docker build -t <registry>/qos-staff-dashboard:latest .`
then `docker push`), paste this and set `image:` to your pushed tag:

```yaml
services:
  dashboard:
    image: <registry>/qos-staff-dashboard:latest
    container_name: qos-dashboard
    ports:
      - "8080:80"
    restart: unless-stopped
```

With a baked image, update links by rebuilding + pushing a new image, then
redeploy the stack.

## Logo uploads (the `uploader` service)

The stack builds two images: the nginx `dashboard` and a small `uploader` that
holds your Combined Storage admin credentials so the browser never sees them.
Set these in Portainer's **Environment variables** panel:

| Variable | Meaning |
| --- | --- |
| `CS_BASE_URL` | How the **uploader** reaches Combined Storage from inside Docker — an *internal* address such as `http://host.docker.internal:4000`, **not** the public hostname (see below) |
| `CS_USERNAME` / `CS_PASSWORD` | Combined Storage admin login |
| `CS_PARENT_ID` | folder to upload logos into (default `root`) |
| `MAX_UPLOAD_BYTES` | upload cap in bytes (default 8388608 = 8MB) |
| `CS_INSECURE_TLS` | `1` only for a self-signed certificate on a trusted network |

Leave them unset to run without uploads — the dashboard serves normally and
`/upload` returns a clear "not configured" error.

### How the uploader reaches Combined Storage

The stack **joins Combined Storage's own Docker network** and talks to it by
container name — `http://combinedstorage:4000`, the default, so `CS_BASE_URL`
usually needs no value at all. That's plain HTTP inside the host: no tunnel, no
TLS (`CS_INSECURE_TLS` is irrelevant), and no dependence on published ports.

It requires that network to exist. Confirm the name:

```sh
docker network ls
```

The stack expects `cloudflared-combinedstorage_default` (the network Combined
Storage joins in its own compose file). If yours differs, set **`CS_NETWORK`**.
A wrong name makes the stack fail to deploy with *"network … not found"*, and a
right network with a differently-named container shows up as `ENOTFOUND
combinedstorage` in the uploader log.

> **Don't use the public hostname with the app's port.** If `cdn.example.com` is
> served by a **Cloudflare Tunnel** (or any reverse proxy) it answers on **443
> only** — nothing listens on 4000 there — so `https://cdn.example.com:4000`
> times out from inside a container, even though the site loads fine in your
> browser. The uploader warns about this combination at startup.

If you'd rather not share a network, `CS_BASE_URL=http://host.docker.internal:4000`
also works, since Combined Storage publishes 4000 on the host and the stack maps
that name to the host gateway.

**The public logo URLs are unaffected.** Combined Storage builds `/f/<token>`
links from its own `PUBLIC_BASE_URL`, not from the address the uploader used —
so staff still get `https://cdn.example.com/f/…`.

The `uploader` port is deliberately **not published to the host**: only the
dashboard container reaches it, via nginx's `/upload` location. Uploading needs
no login (matching the dashboard's no-login model), so keep the stack on an
internal network.

Check it from Portainer's console on the uploader container:

```sh
wget -qO- http://127.0.0.1:3000/health     # {"ok":true,"configured":true}
```

`configured:false` means the `CS_*` variables didn't reach the container.

## Troubleshooting

### Healthcheck: `wget: can't connect to remote host: Connection refused`

The container is marked unhealthy even though the dashboard loads fine in a
browser. This is a healthcheck bug, not a serving problem — confirm with
`docker logs qos-dashboard`: if you see `start worker process`, nginx is up.

Cause: the healthcheck probed `http://localhost/`, which can resolve to `::1`
first. The nginx image's `10-listen-on-ipv6-by-default.sh` only adds
`listen [::]:80` to the *packaged* config; because we ship our own
`nginx.conf`, it logs `differs from the packaged version` and skips that step,
so nginx binds IPv4 only and the IPv6 probe is refused.

Fixed by probing `127.0.0.1` explicitly. If you deployed before this fix, pull
the latest commit and redeploy. External access is unaffected either way —
Docker's published port forwards to the container's IPv4 address.

### Logo upload fails with 502

**Start with the uploader container's log.** On startup it tries to sign in to
Combined Storage and writes the verdict, so most problems are answered without
running anything:

```
[uploader] listening on :3000 -> https://cdn.example.com:4000 folder=root
[uploader] TLS verification: enabled
[uploader] checking Combined Storage at https://cdn.example.com:4000 ...
[uploader] OK - signed in to Combined Storage, uploading into folder "root". Ready.
```

If it can't, the next line names the cause and the fix (untrusted certificate →
`CS_INSECURE_TLS=1`, hostname that doesn't resolve inside Docker, wrong port,
rejected login, and so on). Restart the container to re-check.

It also logs **every request it receives**. If you attempt an upload and nothing
new appears in this log, the request never arrived — the problem is between the
browser and the uploader (see "Cannot reach the uploader" below), not with
Combined Storage.

### Or probe it over HTTP

**Open this in a browser** on any machine that can reach the dashboard — no
container shell needed:

```
http://<docker-host>:1919/uploader-health?probe=1
```

It actually logs in to Combined Storage and reports what happened:

```json
{"ok":true,"configured":true,"reachable":true,"base":"https://…","folder":"root"}
```

`reachable:false` comes with a `detail` naming the cause. `configured:false`
means the `CS_*` variables never reached the container.

If `/uploader-health` returns the **dashboard page instead of JSON**, the
`dashboard` image is out of date: that route lives in `nginx.conf`, which is
baked into the *dashboard* image, not the uploader's. Redeploy with a rebuild —
**both** images need building, and the uploader running with fresh settings is
not enough on its own.

If it returns **`Cannot reach the uploader service`**, the `uploader` container
isn't reachable from the dashboard container — which is also what a 502 on
upload means in that case. Check:

- Portainer → Containers shows `qos-dashboard-uploader` **running**.
- Both containers are in the **same stack/network**. nginx resolves the
  uploader by its compose service name (`uploader`) over Docker's embedded DNS,
  which only works on a stack network, not the default bridge.
- The stack was deployed with the **Repository** method — Portainer's **Web
  editor cannot build images from a Dockerfile**, so the uploader would never
  be built.

The dashboard's own error messages now carry the reason too — a failed upload
shows it under the logo box in the Edit dialog, rather than a bare "502".

> The uploader image is `node:22-alpine`, which has **no bash**. If you do want
> a shell in Portainer's console, choose `/bin/sh`.

> **Fixed in this version:** Combined Storage refuses a second file with the same
> name in a folder ("An item with that name already exists here"), so the *second*
> logo upload used to fail with a 502 — every browser sends much the same
> filename. The uploader now gives each upload a unique name, so repeated
> uploads of `logo.png` all succeed. If you hit 502 on your second upload,
> redeploy to pick this up.

Otherwise `/upload` returns 502 when the `uploader` can't reach Combined
Storage. The JSON body carries the reason — check the uploader's container logs:

- `Combined Storage login failed (401)` — wrong `CS_USERNAME` / `CS_PASSWORD`.
- `self signed certificate` / TLS errors — set `CS_INSECURE_TLS=1` if that
  certificate is expected on your network.
- connection refused / timeout — `CS_BASE_URL` is wrong, or Combined Storage
  isn't reachable from the Docker network the stack runs on.

A 503 with "Upload service is not configured" means the `CS_*` variables are
missing. If `/upload` 502s with an nginx page rather than JSON, the `uploader`
container isn't running — the dashboard itself keeps serving either way.

## Option C — Edit links on the host without rebuilding

If you'd rather change links directly on the Docker host, put `links.json` on the
host and bind-mount it over the baked copy. Add this to the service in your stack
(host path must exist and be readable by the container):

```yaml
    volumes:
      - /srv/qos-dashboard/links.json:/usr/share/nginx/html/config/links.json:ro
```

Then edit `/srv/qos-dashboard/links.json` on the host and reload the page —
`nginx.conf` serves `config/links.json` with `no-store`, so changes show on the
next load. (Bind mounts only work when Portainer manages the Docker host directly,
not for edge/agent setups without host filesystem access.)
