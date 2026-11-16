# ChessMate game server image.
#   docker build -t chessmate-server .        (from the repo root)
# Contains the compiled Node server, its production npm dependencies, and a
# native Stockfish binary that the engine workers spawn as a separate process
# (GPL Stockfish is never linked into our code).

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@12
# Manifests first so dependency installs are cached between code changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
# The app's manifest keeps the lockfile consistent; its deps are not installed.
COPY apps/app/package.json apps/app/
RUN pnpm install --frozen-lockfile --filter "@chessmate/server..."
COPY packages/core packages/core
COPY apps/server apps/server
RUN pnpm --filter @chessmate/server build \
  && pnpm --filter @chessmate/server deploy --prod /out

# ---- runtime ----
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_PATH=/data/pglite \
    STOCKFISH_PATH=/usr/games/stockfish
WORKDIR /srv
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
# Migrations, if the server ships any as files next to its sources.
COPY --from=build /repo/apps/server/drizzle* ./drizzle/
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
