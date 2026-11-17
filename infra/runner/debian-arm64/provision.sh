#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION=${NODE_VERSION:-24.11.1}
PNPM_VERSION=${PNPM_VERSION:-12.3.4}
APT_PACKAGES=(git curl libicu76 build-essential python3 jq unzip xz-utils vnstat ruby sqlite3)
here=$(cd "$(dirname "$0")" && pwd)
repo_root=$(cd "$here/../../.." && pwd)

root_part() {
  local user="${1:?runner user}"
  [ "$(id -u)" -eq 0 ] || { echo "root part must run as root" >&2; exit 1; }
  if ! grep -qs '^deb .*deb.debian.org' /etc/apt/sources.list /etc/apt/sources.list.d/*.list \
    && ! grep -qs 'deb.debian.org' /etc/apt/sources.list.d/*.sources; then
    sed -i 's/^deb cdrom/# deb cdrom/' /etc/apt/sources.list
    cat >/etc/apt/sources.list.d/debian.sources <<'SRC'
Types: deb
URIs: http://deb.debian.org/debian
Suites: trixie trixie-updates
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb
URIs: http://security.debian.org/debian-security
Suites: trixie-security
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
SRC
  fi
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${APT_PACKAGES[@]}"
  loginctl enable-linger "$user"
  local start end
  start=$(date +%s%N)
  getent hosts github.com >/dev/null
  end=$(date +%s%N)
  if [ $(((end - start) / 1000000)) -gt 1000 ]; then
    echo "WARNING: DNS lookup took $(((end - start) / 1000000))ms; fix /etc/resolv.conf before installing" >&2
  fi
}

pinned_actions() {
  grep -rhoE 'uses: *[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/[^@ ]+)?@[^ #]+' "$repo_root/.github" \
    | sed -E 's/uses: *//; s#^([^/]+/[^/@]+)(/[^@]*)?@#\1@#' | sort -u \
    | while IFS=@ read -r repo ref; do
        if [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
          echo "$repo@$ref"
        else
          sha=$(git ls-remote "https://github.com/$repo" "refs/tags/$ref^{}" "refs/tags/$ref" "refs/heads/$ref" | head -1 | cut -f1)
          [ -n "$sha" ] && echo "$repo@$sha"
        fi
      done
}

runner_part() {
  local prefix="$HOME/.local" cache="$HOME/actions-archive-cache"
  local instances=("$@")
  [ ${#instances[@]} -gt 0 ] || instances=("$HOME/actions-runner" "$HOME/actions-runner-2")
  mkdir -p "$prefix/bin" "$cache"

  if [ "$("$prefix/bin/node" --version 2>/dev/null)" != "v$NODE_VERSION" ]; then
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-arm64.tar.xz" \
      | tar -xJ -C "$prefix" --strip-components=1
  fi
  export PATH="$prefix/bin:$PATH"
  if [ "$(pnpm --version 2>/dev/null)" != "$PNPM_VERSION" ]; then
    npm install -g --prefix "$prefix" "pnpm@$PNPM_VERSION"
  fi

  pinned_actions | while IFS=@ read -r repo sha; do
    local file="$cache/${repo/\//_}/$sha.tar.gz"
    [ -s "$file" ] && continue
    echo "caching $repo@$sha"
    mkdir -p "$(dirname "$file")"
    curl -fsSL "https://api.github.com/repos/$repo/tarball/$sha" -o "$file.tmp" && mv "$file.tmp" "$file"
  done

  local first="${instances[0]}" n=0
  for dir in "${instances[@]}"; do
    n=$((n + 1))
    [ -d "$dir" ] || { echo "skipping $dir: not unpacked/registered yet (README.md)"; continue; }
    {
      echo "PATH=$prefix/bin:/usr/local/bin:/usr/bin:/bin"
      echo "ACTIONS_RUNNER_ACTION_ARCHIVE_CACHE=$cache"
      if [ "$dir" != "$first" ]; then echo "RUNNER_TOOL_CACHE=$first/_work/_tool"; fi
    } >"$dir/.env"
    local unit="actions-runner$([ "$n" -gt 1 ] && echo "-$n").service"
    mkdir -p "$HOME/.config/systemd/user"
    cat >"$HOME/.config/systemd/user/$unit" <<UNIT
[Unit]
Description=GitHub Actions runner ($dir)
After=network-online.target

[Service]
WorkingDirectory=$dir
ExecStart=$dir/run.sh
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
    systemctl --user daemon-reload
    systemctl --user enable --now "$unit"
  done
}

case "${1:-}" in
  root) shift; root_part "$@" ;;
  runner) shift; runner_part "$@" ;;
  pinned-actions) pinned_actions ;;
  *) echo "usage: sudo $0 root <runner-user> | $0 runner [instance-dir ...] | $0 pinned-actions" >&2; exit 2 ;;
esac
