FROM node:22-alpine

ENV HTTP_PROXY=http://http.docker.internal:3128
ENV HTTPS_PROXY=http://http.docker.internal:3128
ENV npm_config_proxy=http://http.docker.internal:3128
ENV npm_config_https_proxy=http://http.docker.internal:3128
ENV NODE_USE_ENV_PROXY=1

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY services ./services
COPY packages ./packages
COPY tests ./tests
COPY scripts ./scripts
COPY docs ./docs
COPY diagrams ./diagrams

RUN pnpm install --no-frozen-lockfile

CMD ["sh", "-c", "node -v"]
