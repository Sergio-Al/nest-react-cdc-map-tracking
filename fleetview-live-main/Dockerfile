# ── Build stage ──────────────────────────────────────────────
# Bun, not node: this package is Bun-managed — bun.lockb is the source of
# truth and the checked-in package-lock.json drifts out of sync (npm ci fails).
FROM oven/bun:1-alpine AS build

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .

# Vite bakes VITE_* vars into the bundle at BUILD time. These are the URLs the
# *browser* uses, so localhost:3000 is correct when the backend's port 3000 is
# published on the same machine. Override via compose build args for LAN/remote.
ARG VITE_API_URL=http://localhost:3000
ARG VITE_WS_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL

RUN bun run build

# ── Serve stage (nginx) ──────────────────────────────────────
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
