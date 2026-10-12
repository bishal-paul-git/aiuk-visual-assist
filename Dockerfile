# Visual Assist — server edition (API routes, live sessions, sign-in, durable store).
# Build:  docker build -t visual-assist .
# Run:    docker run -p 3000:3000 -v va-data:/data \
#           -e AUTH_SECRET=<32+ random chars> -e ANTHROPIC_API_KEY=<optional> visual-assist

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATA_DIR must be unset at build time (prerendered pages would seed it).
ENV NEXT_TELEMETRY_DISABLED=1 STANDALONE=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- "http://127.0.0.1:3000/api/health?probe=live" || exit 1
CMD ["node", "server.js"]
