# syntax=docker/dockerfile:1
# Multi-stage build: install + build, then a slim runtime image.

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first to maximize layer caching
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the source and build
COPY . .
RUN npm run build

# Drop devDependencies for the runtime stage
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# `su-exec` lets us chown the mounted volume (mounted by Railway with root
# ownership) and then drop privileges to the unprivileged `node` user.
RUN apk add --no-cache su-exec

# Copy production node_modules + built assets + server code
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Note: container starts as root so the entrypoint can chown UPLOADS_DIR.
# It then drops to `node` via su-exec before running the app, so the Node
# process itself never has root privileges.

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/index.mjs"]
