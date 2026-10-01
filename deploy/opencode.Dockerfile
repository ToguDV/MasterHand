# syntax=docker/dockerfile:1

FROM node:22-slim

ARG OPENCODE_VERSION=2.0.6

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git ripgrep unzip xz-utils \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @opencode/cli@${OPENCODE_VERSION} \
  && npm cache clean --force

RUN mkdir -p /workspace /home/node/.config/opencode /home/node/.local/share/opencode \
  && chown -R node:node /workspace /home/node/.config /home/node/.local

USER node
WORKDIR /workspace

EXPOSE 4096
CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]
