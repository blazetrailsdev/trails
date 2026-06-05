#!/usr/bin/env bash
# refine-done.sh — signal btwhooks that a refine agent has finished so its
# tmux pane is torn down and the backlog dashboard repaints.
#
# Usage: refine-done.sh <story-id> <outcome>
#   outcome ∈ done | changed | no-change | aborted
#       (whatever `pnpm tasks refine` reported in its final JSON line; pass
#        `aborted` from an error path where the CLI never ran.)
#
# This is the refine counterpart to the worker post-merge-findings skill. It
# POSTs the *ungated* form of /cleanup-pane (no PR ⇒ the server skips the
# merge gate), keyed on $TMUX_PANE — the authoritative handle for the pane
# that ran this. Refine agents open no PR, so there is no other handle and no
# review to wait on; teardown is safe the moment they signal.
set -euo pipefail

ID="${1:?usage: refine-done.sh <story-id> <outcome>}"
OUTCOME="${2:?usage: refine-done.sh <story-id> <outcome>}"

if [[ -z "${TMUX_PANE:-}" ]]; then
  echo "refine-done: \$TMUX_PANE unset — not running inside a tmux pane, skipping cleanup" >&2
  exit 0
fi

# Resolve the btwhooks container IP the same way the other skills do.
DOCKER_INSPECT_ERR="$(docker inspect btwhooks.web.1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>&1 1>/tmp/.rd-ip.$$ || true)"
CONTAINER_IP="$(cat /tmp/.rd-ip.$$ 2>/dev/null || true)"
rm -f /tmp/.rd-ip.$$
if [[ -z "$CONTAINER_IP" ]]; then
  echo "refine-done: btwhooks.web.1 container not found, skipping cleanup" >&2
  echo "refine-done: docker inspect stderr: ${DOCKER_INSPECT_ERR}" >&2
  exit 0
fi
echo "refine-done: resolved container IP ${CONTAINER_IP}"

# No "pr" field ⇒ the server takes the ungated fire-and-forget path. kind
# labels the logs/SSE; id+outcome repaint the backlog.
HTTP_CODE="$(curl -s -o /tmp/.rd-body.$$ -w '%{http_code}' --max-time 5 -X POST \
  "http://${CONTAINER_IP}:8081/cleanup-pane" \
  -H 'Content-Type: application/json' \
  -d "{\"kind\":\"refine\",\"id\":\"${ID}\",\"outcome\":\"${OUTCOME}\",\"pane\":\"${TMUX_PANE}\"}" 2>/tmp/.rd-err.$$ || echo "curl-failed")"
RESP_BODY="$(cat /tmp/.rd-body.$$ 2>/dev/null || true)"
CURL_ERR="$(cat /tmp/.rd-err.$$ 2>/dev/null || true)"
rm -f /tmp/.rd-body.$$ /tmp/.rd-err.$$
echo "refine-done: http=${HTTP_CODE} body=${RESP_BODY:-<empty>} err=${CURL_ERR:-<none>}"
