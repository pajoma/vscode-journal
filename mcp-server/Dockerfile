# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache bash git openssh-client \
 && git config --system --add safe.directory /data/journal
# git-sync (CC0, https://github.com/simonthum/git-sync), pinned to a commit and verified by checksum
ADD --chmod=755 --checksum=sha256:a882954cb08288b227ec61b6cb1814f4f01a37648eaabd6d6add3d4aab0c156f \
    https://raw.githubusercontent.com/simonthum/git-sync/b991840c5533c010adda58015de44ba36d6bc1d0/git-sync \
    /usr/local/bin/git-sync
WORKDIR /app
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    JOURNAL_REPO_PATH=/data/journal \
    GIT_SYNC=true
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "dist/http.js"]
