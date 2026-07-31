# QoS Staff Dashboard — static site served by nginx. No login, no backend.
FROM nginx:1.27-alpine

# Site content
COPY index.html /usr/share/nginx/html/index.html
COPY assets/ /usr/share/nginx/html/assets/
COPY config/ /usr/share/nginx/html/config/

# Server config (no-cache for the app shell + link config)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q --spider http://localhost/ || exit 1
