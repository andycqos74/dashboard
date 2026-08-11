# Logo upload proxy — no dependencies, so no install step and nothing to audit
# beyond server.js.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV PORT=3000
EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
