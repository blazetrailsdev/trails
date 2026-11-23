# syntax=docker/dockerfile:1
# Built by bin/deploy from a staged copy of the trails monorepo: the workspace
# packages arrive already built (dist/), so the image only installs npm deps.
ARG NODE_VERSION=26.13.0
FROM node:${NODE_VERSION}-slim

WORKDIR /trails

RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@12.3.4 --activate

COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@blazetrails/example-chatter..."

WORKDIR /trails/examples/chatter
ENV TRAILS_ENV=production NODE_ENV=production
RUN SECRET_KEY_BASE_DUMMY=1 pnpm build && mkdir -p storage tmp log

EXPOSE 5000
ENTRYPOINT ["/trails/examples/chatter/bin/docker-entrypoint"]
CMD ["sh", "-c", "exec node bin/trails server -b 0.0.0.0 -p ${PORT:-5000}"]
