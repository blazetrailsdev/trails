#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
node_version=$(sed -nE 's/^ *default: "([0-9]+\.[0-9]+\.[0-9]+)"$/\1/p' "$repo/.github/actions/setup-pnpm/action.yml" | sed -n 2p)
pnpm_version=$(sed -nE 's/^ *default: "([0-9]+\.[0-9]+\.[0-9]+)"$/\1/p' "$repo/.github/actions/setup-pnpm/action.yml" | sed -n 1p)
archive_cache="$HOME/actions-archive-cache"

root_part() {
  local user="$1"
  [ "$(id -u)" = 0 ] || { echo "provision.sh root: run as root" >&2; exit 1; }
  if ! grep -rqs '^deb .*deb.debian.org' /etc/apt/sources.list /etc/apt/sources.list.d/; then
    echo "deb http://deb.debian.org/debian trixie main" >/etc/apt/sources.list.d/debian.list
  fi
  apt-get update
  apt-get install -y git curl libicu76 build-essential python3 jq unzip xz-utils vnstat ruby sqlite3
  loginctl enable-linger "$user"
  local t0 t1
  t0=$(date +%s); getent hosts github.com >/dev/null; t1=$(date +%s)
  if [ $((t1 - t0)) -ge 2 ]; then
    echo "::warning::DNS lookup took $((t1 - t0))s; fix /etc/resolv.conf before installing" >&2
  fi
}

action_pins() {
  grep -rhoE 'uses: [A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/[^@ ]+)?@[^ #]+' "$repo/.github" \
    | sed -E 's/^uses: //; s|^([^/]+/[^/@]+)(/[^@]+)?@|\1@|' | sort -u \
    | while IFS=@ read -r action ref; do
        if [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
          sha=$ref
        else
          sha=$(git ls-remote "https://github.com/$action" "refs/tags/$ref^{}" "refs/tags/$ref" "refs/heads/$ref" | head -1 | cut -f1)
        fi
        echo "$action $sha"
      done
}

fill_archive_cache() {
  mkdir -p "$archive_cache"
  action_pins | while read -r action sha; do
    local dest="$archive_cache/${action/\//_}/$sha.tar.gz"
    [ -s "$dest" ] && continue
    mkdir -p "$(dirname "$dest")"
    curl -fsSL "https://api.github.com/repos/$action/tarball/$sha" -o "$dest.tmp"
    mv "$dest.tmp" "$dest"
    echo "cached $action@$sha"
  done
}

user_part() {
  [ "$(id -u)" != 0 ] || { echo "provision.sh user: run as the runner user" >&2; exit 1; }
  local prefix="$HOME/.local" arch=linux-arm64
  if [ "$("$prefix/bin/node" --version 2>/dev/null)" != "v$node_version" ]; then
    curl -fsSL "https://nodejs.org/dist/v$node_version/node-v$node_version-$arch.tar.xz" \
      | tar -xJ -C "$prefix" --strip-components=1
  fi
  if [ "$(PATH="$prefix/bin:$PATH" pnpm --version 2>/dev/null)" != "$pnpm_version" ]; then
    PATH="$prefix/bin:$PATH" npm install -g --prefix "$prefix" "pnpm@$pnpm_version"
  fi
  fill_archive_cache
  local first="" instance
  for instance in "${@:-actions-runner}"; do
    local dir="$HOME/$instance"
    [ -d "$dir" ] || { echo "skip $instance: $dir is not registered yet (README.md)"; continue; }
    {
      echo "PATH=$prefix/bin:/usr/local/bin:/usr/bin:/bin"
      echo "ACTIONS_RUNNER_ACTION_ARCHIVE_CACHE=$archive_cache"
      [ -z "$first" ] || echo "RUNNER_TOOL_CACHE=$HOME/$first/_work/_tool"
    } >"$dir/.env"
    [ -n "$first" ] || first=$instance
    mkdir -p "$HOME/.config/systemd/user"
    cat >"$HOME/.config/systemd/user/$instance.service" <<UNIT
[Unit]
Description=GitHub Actions runner ($instance)
After=network-online.target

[Service]
WorkingDirectory=$dir
ExecStart=$dir/run.sh
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
UNIT
    systemctl --user daemon-reload
    systemctl --user enable --now "$instance.service"
  done
}

case "${1:-}" in
  root) root_part "${2:?runner user}" ;;
  user) shift; user_part "$@" ;;
  actions)
    action_pins | while read -r action sha; do
      [ -s "$archive_cache/${action/\//_}/$sha.tar.gz" ] || echo "missing $action@$sha"
    done
    ;;
  *) echo "usage: provision.sh root <runner-user> | user [instance...] | actions" >&2; exit 2 ;;
esac
