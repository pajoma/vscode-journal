# syntax=docker/dockerfile:1
# Build context: the repository root (journal-core lives in packages/), see Dockerfile.dockerignore
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY packages/journal-core/package.json packages/journal-core/package-lock.json packages/journal-core/tsconfig.json ./packages/journal-core/
COPY packages/journal-core/src ./packages/journal-core/src
WORKDIR /app/mcp-server
COPY mcp-server/package.json mcp-server/package-lock.json ./
# postinstall installs journal-core's dependencies (with @types/node to build it)
RUN npm ci --no-audit --no-fund
COPY mcp-server/tsconfig.json ./
COPY mcp-server/src ./src
RUN npm run build && npm prune --omit=dev && npm --prefix ../packages/journal-core prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache bash git openssh-client \
 && git config --system --add safe.directory /data/journal
# git-sync (CC0, https://github.com/simonthum/git-sync), pinned to a commit and verified by checksum
ADD --chmod=755 --checksum=sha256:a882954cb08288b227ec61b6cb1814f4f01a37648eaabd6d6add3d4aab0c156f \
    https://raw.githubusercontent.com/simonthum/git-sync/b991840c5533c010adda58015de44ba36d6bc1d0/git-sync \
    /usr/local/bin/git-sync
# node_modules/journal-core links to ../../packages/journal-core: keep that layout
WORKDIR /app/packages/journal-core
COPY --from=build /app/packages/journal-core/package.json ./
COPY --from=build /app/packages/journal-core/dist ./dist
COPY --from=build /app/packages/journal-core/node_modules ./node_modules
WORKDIR /app/mcp-server
COPY mcp-server/package.json ./
COPY --from=build /app/mcp-server/node_modules ./node_modules
COPY --from=build /app/mcp-server/dist ./dist
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    JOURNAL_REPO_PATH=/data/journal \
    GIT_SYNC=true
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "dist/http.js"]
