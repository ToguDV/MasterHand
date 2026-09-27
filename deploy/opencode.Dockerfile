# syntax=docker/dockerfile:1

FROM node:22-slim

ARG OPENCODE_VERSION=latest

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git ripgrep unzip xz-utils \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g opencode-ai@${OPENCODE_VERSION} \
  && npm cache clean --force

RUN mkdir -p /workspace && chown node:node /workspace

USER node
WORKDIR /workspace

EXPOSE 4096
CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]
