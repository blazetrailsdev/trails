#!/usr/bin/env bash
set -euo pipefail

shard="${1:?usage: lint-shard-paths.sh <shard>}"

activerecord=(packages/activerecord)
rails_and_scripts=(packages/activemodel packages/actionpack packages/trailties scripts)
rest_a=(
  packages/actiontext packages/activejob packages/activerecord-cli
  packages/builder packages/chronic packages/et-orbi packages/listen
  packages/mysql2 packages/pg packages/rack packages/rack-proxy
  packages/rack-session packages/rack-test packages/rake packages/ruby-compat
  packages/solid-cache packages/sqlite3 packages/vitest-matchers packages/website
)
rest_b=(
  packages/actioncable packages/actionmailbox packages/actionmailer
  packages/actionview packages/bcrypt packages/date packages/did-you-mean
  packages/fugit packages/i18n packages/image-processing packages/libxml-ruby
  packages/mini-magick packages/raabro packages/rack-cache packages/rack-cors
  packages/solid-queue packages/turbo packages/tzinfo packages/vite-trails
)

case "$shard" in
  activerecord) printf '%s\n' "${activerecord[@]}" ;;
  rails-and-scripts) printf '%s\n' "${rails_and_scripts[@]}" ;;
  rest-a) printf '%s\n' "${rest_a[@]}" ;;
  rest-b) printf '%s\n' "${rest_b[@]}" ;;
  rest)
    echo .
    for path in "${activerecord[@]}" "${rails_and_scripts[@]}" "${rest_a[@]}" "${rest_b[@]}"; do
      printf '%s\n' --ignore-pattern "$path/**"
    done
    ;;
  *)
    echo "lint-shard-paths.sh: unknown shard '$shard'" >&2
    exit 1
    ;;
esac
