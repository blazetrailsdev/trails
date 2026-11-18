import { requestToRackEnvWithBody, rackResponseToFetchResponse } from "./rack-bridge.ts";
import { Trails } from "@blazetrails/trailties";
import type { RackEnv, RackResponse } from "@blazetrails/rack";

import { copyFileSync, existsSync } from "node:fs";

// Lambda's /var/task is read-only; SQLite wants a writable file beside its journal.
if (process.env.SPIKE_DB_SEED && process.env.SQLITE_PATH && !existsSync(process.env.SQLITE_PATH)) {
  copyFileSync(process.env.SPIKE_DB_SEED, process.env.SQLITE_PATH);
}

export const bootTiming: Record<string, number> = { moduleEval: performance.now() };
let booted: Promise<typeof Trails.application> | undefined;
function boot() {
  return (booted ??= (async () => {
    bootTiming.bootStart = performance.now();
    // `trails build` (scripts/build.sh) writes it, so it is absent until the first build.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await import("../.trails/entry.generated.js");
    bootTiming.initDone = performance.now();
    return Trails.application;
  })());
}

export async function fetch(request: Request): Promise<Response> {
  const app = await boot();
  return rackResponseToFetchResponse(await app.call(await requestToRackEnvWithBody(request)));
}
export default { fetch };

export async function rack(env: RackEnv): Promise<RackResponse> {
  return (await boot()).call(env);
}

/** API Gateway HTTP API v2 / Function URL payload, the fields this handler reads. */
interface LambdaEvent {
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}

interface LambdaResult {
  statusCode: number;
  headers: Record<string, string>;
  cookies: string[];
  body: string;
  isBase64Encoded: boolean;
}

export async function handler(event: LambdaEvent): Promise<LambdaResult> {
  const host = event.headers?.host ?? "lambda.local";
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const method = event.requestContext?.http?.method ?? "GET";
  const body =
    event.body == null
      ? undefined
      : event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : event.body;
  const res = await fetch(
    new Request(`https://${host}${event.rawPath ?? "/"}${qs}`, {
      method,
      headers: event.headers ?? {},
      body: method === "GET" || method === "HEAD" ? undefined : body,
    }),
  );
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (k !== "set-cookie") headers[k] = v;
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = /^(text\/|application\/(json|javascript|xml))/.test(
    res.headers.get("content-type") ?? "",
  );
  return {
    statusCode: res.status,
    headers,
    cookies: res.headers.getSetCookie(),
    body: text ? buf.toString("utf8") : buf.toString("base64"),
    isBase64Encoded: !text,
  };
}

// Boot during Lambda's INIT phase (CPU-boosted, and unbilled for on-demand functions)
// rather than inside the first invocation.
if (process.env.AWS_LAMBDA_FUNCTION_NAME) await boot();
