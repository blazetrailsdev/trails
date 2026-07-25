#!/usr/bin/env bash
# rfc-refine-done.sh — signal btwhooks that an RFC-refine (story grooming) agent
# has finished, hand its markdown summary to the dashboard, and tear down its
# tmux pane.
#
# Usage: rfc-refine-done.sh <rfc-slug> <outcome> [summary-file]
#   outcome ∈ changed | no-change | aborted
#   summary-file  path to a markdown file with the agent's report (optional;
#                 empty/missing ⇒ no summary, just the outcome + pane reap).
#
# This is the RFC-level counterpart to refine-done.sh. It POSTs the *ungated*
# form of /cleanup-pane (no PR ⇒ the server skips the merge gate), keyed on
# $TMUX_PANE. The extra `summary` field is persisted by btwhooks and rendered as
# the "Last refine" card on the RFC show page (kind=rfc-refine, id=<rfc-slug>).
set -euo pipefail

SLUG="${1:?usage: rfc-refine-done.sh <rfc-slug> <outcome> [summary-file]}"
OUTCOME="${2:?usage: rfc-refine-done.sh <rfc-slug> <outcome> [summary-file]}"
SUMMARY_FILE="${3:-}"

SUMMARY=""
if [[ -n "$SUMMARY_FILE" ]]; then
  if [[ -r "$SUMMARY_FILE" ]]; then
    SUMMARY="$(cat "$SUMMARY_FILE")"
  else
    echo "rfc-refine-done: summary file '$SUMMARY_FILE' not readable — sending empty summary" >&2
  fi
fi

if [[ -z "${TMUX_PANE:-}" ]]; then
  echo "rfc-refine-done: \$TMUX_PANE unset — not running inside a tmux pane, skipping cleanup" >&2
  exit 0
fi

# Resolve the btwhooks container IP the same way the other skills do.
DOCKER_INSPECT_ERR="$(docker inspect btwhooks.web.1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>&1 1>/tmp/.rrd-ip.$$ || true)"
CONTAINER_IP="$(cat /tmp/.rrd-ip.$$ 2>/dev/null || true)"
rm -f /tmp/.rrd-ip.$$
if [[ -z "$CONTAINER_IP" ]]; then
  echo "rfc-refine-done: btwhooks.web.1 container not found, skipping cleanup" >&2
  echo "rfc-refine-done: docker inspect stderr: ${DOCKER_INSPECT_ERR}" >&2
  exit 0
fi
echo "rfc-refine-done: resolved container IP ${CONTAINER_IP}"

# Build the JSON body with jq so the (multi-line, markdown) summary is escaped
# correctly. No "pr" field ⇒ the server takes the ungated fire-and-forget path.
PAYLOAD="$(jq -nc \
  --arg kind "rfc-refine" \
  --arg id "$SLUG" \
  --arg outcome "$OUTCOME" \
  --arg pane "$TMUX_PANE" \
  --arg summary "$SUMMARY" \
  '{kind:$kind, id:$id, outcome:$outcome, pane:$pane, summary:$summary}')"

HTTP_CODE="$(curl -s -o /tmp/.rrd-body.$$ -w '%{http_code}' --max-time 5 -X POST \
  "http://${CONTAINER_IP}:8081/cleanup-pane" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" 2>/tmp/.rrd-err.$$ || echo "curl-failed")"
RESP_BODY="$(cat /tmp/.rrd-body.$$ 2>/dev/null || true)"
CURL_ERR="$(cat /tmp/.rrd-err.$$ 2>/dev/null || true)"
rm -f /tmp/.rrd-body.$$ /tmp/.rrd-err.$$
echo "rfc-refine-done: http=${HTTP_CODE} body=${RESP_BODY:-<empty>} err=${CURL_ERR:-<none>}"
