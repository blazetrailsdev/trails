#!/usr/bin/env bash
set -euo pipefail
NODE_VERSION=24.21.0
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y build-essential curl openssl python3 xz-utils
mkdir -p /opt/node
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
  | tar -xJ -C /opt/node --strip-components=1
