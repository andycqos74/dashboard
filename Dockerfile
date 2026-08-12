# QoS Staff Dashboard — static site served by nginx. No login, no backend.
FROM nginx:1.27-alpine

# Site content
COPY index.html /usr/share/nginx/html/index.html
COPY storage.js /usr/share/nginx/html/storage.js
COPY assets/ /usr/share/nginx/html/assets/
COPY config/ /usr/share/nginx/html/config/

# Server config (no-cache for the app shell + link config)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Probe 127.0.0.1 explicitly: "localhost" can resolve to ::1 first. Because we
# replace default.conf, the image's 10-listen-on-ipv6-by-default.sh skips adding
# "listen [::]:80" (it only patches the packaged config), so nginx binds IPv4
# only and a ::1 probe fails with "connection refused" while the site is fine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
