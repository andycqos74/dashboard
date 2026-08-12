# Logo upload proxy — no dependencies, so no install step and nothing to audit
# beyond server.js.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV PORT=3000
EXPOSE 3000

# Starts as root only long enough to take ownership of the shared config volume
# (fresh Docker volumes are root-owned), then server.js drops to uid 1000 before
# serving anything. Override with RUN_UID / RUN_GID.

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
