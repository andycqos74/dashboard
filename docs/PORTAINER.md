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
   the default `8080`.
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
