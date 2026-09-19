FROM node:22-alpine

ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ARG NO_PROXY=
ARG NODE_USE_ENV_PROXY=0

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV http_proxy=${HTTP_PROXY}
ENV https_proxy=${HTTPS_PROXY}
ENV no_proxy=${NO_PROXY}
ENV npm_config_proxy=${HTTP_PROXY}
ENV npm_config_https_proxy=${HTTPS_PROXY}
ENV NODE_USE_ENV_PROXY=${NODE_USE_ENV_PROXY}

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY services ./services
COPY packages ./packages
COPY tests ./tests
COPY scripts ./scripts
COPY docs ./docs
COPY diagrams ./diagrams

RUN pnpm install --no-frozen-lockfile

CMD ["sh", "-c", "node -v"]
