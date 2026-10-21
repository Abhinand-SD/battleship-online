# ---------- Build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --ignore-scripts
COPY . .
# Generate the Prisma client, build the SPA and bundle the server.
RUN npm run db:generate && npm run build
# Drop dev dependencies for the runtime image (prisma CLI stays: it runs migrations at startup).
RUN npm prune --omit=dev --ignore-scripts

# ---------- Runtime stage ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    SERVE_CLIENT=true \
    CLIENT_DIST=/app/packages/client/dist \
    TRUST_PROXY=true
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/prisma ./packages/server/prisma
COPY --from=build /app/packages/server/prisma.config.ts ./packages/server/prisma.config.ts
COPY --from=build /app/packages/client/dist ./packages/client/dist
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
