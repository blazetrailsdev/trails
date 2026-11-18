#!/usr/bin/env bash
# Run build/pkg under AWS's Lambda nodejs:26 image (Runtime Interface Emulator) and invoke it.
set -euo pipefail
cd "$(dirname "$0")/.."
docker rm -f trails-lambda-rie >/dev/null 2>&1 || true
docker run -d --name trails-lambda-rie -p 127.0.0.1:9123:8080 -v "$PWD/build/pkg:/var/task:ro" \
  -e TRAILS_ENV=production -e SQLITE_PATH=/tmp/spike.sqlite3 -e SPIKE_DB_SEED=db/spike.sqlite3 \
  public.ecr.aws/lambda/nodejs:26 handler.handler >/dev/null
trap 'docker rm -f trails-lambda-rie >/dev/null' EXIT
timeout 20 bash -c 'until curl -s -o /dev/null 127.0.0.1:9123; do :; done'
for p in /posts /health /posts; do
  curl -s -o /dev/null -w "$p %{http_code} %{time_total}s\n" -XPOST \
    127.0.0.1:9123/2015-03-31/functions/function/invocations \
    -d "{\"rawPath\":\"$p\",\"headers\":{\"host\":\"local\"},\"requestContext\":{\"http\":{\"method\":\"GET\"}}}"
done
docker logs trails-lambda-rie 2>&1 | grep -E "REPORT" | sed 's/RequestId: [^[:space:]]*//'
