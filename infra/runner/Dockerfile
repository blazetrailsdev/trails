# GitHub Actions self-hosted runner image for Dokku.
#
# Each container is ephemeral: it mints a fresh registration token at boot,
# picks up exactly one job, then exits. Dokku restarts it. Scale with
# `dokku ps:scale gh-runner runner=N`.
#
# Pinned toolchain matches `.github/workflows/ci.yml`:
#   - Node 22 (matches `actions/setup-node@v4` with `node-version: 22`)
#   - pnpm 10.27.0 (matches `pnpm/action-setup@v4` with `version: 10.27.0`)
# Pre-installing both means jobs skip the install step entirely.
FROM ubuntu:24.04

ARG RUNNER_VERSION=2.334.0
ARG NODE_MAJOR=22
ARG PNPM_VERSION=10.27.0

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq sudo unzip xz-utils \
      build-essential python3 \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "pnpm@${PNPM_VERSION}" \
 && npm cache clean --force

# Ubuntu 24.04 ships with a default `ubuntu` user at UID 1000; remove it
# so we can pin our runner user there. Pinning the UID gives the
# persistent pnpm-store volume mount (`dokku storage:mount …`) stable
# ownership across image rebuilds.
RUN userdel -r ubuntu 2>/dev/null || true \
 && useradd -u 1000 -m -d /home/runner -s /bin/bash runner
WORKDIR /home/runner

RUN curl -fsSL -o actions-runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
 && tar xzf actions-runner.tar.gz \
 && rm actions-runner.tar.gz \
 && ./bin/installdependencies.sh \
 && chown -R runner:runner /home/runner

USER runner

# Path is relative to the build context (repo root under Dokku), not the
# Dockerfile location.
COPY --chown=runner:runner infra/runner/entrypoint.sh /home/runner/entrypoint.sh
RUN chmod +x /home/runner/entrypoint.sh

ENTRYPOINT ["/home/runner/entrypoint.sh"]
