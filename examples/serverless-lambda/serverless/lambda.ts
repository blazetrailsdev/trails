import {
  requestToRackEnvWithBody,
  rackResponseToFetchResponse,
} from "../../../packages/website/src/lib/frontiers/rack-bridge.ts";
import { Trails } from "@blazetrails/trailties";
import type { RackEnv, RackResponse } from "@blazetrails/rack";

import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (process.env.SPIKE_DB_SEED && process.env.SQLITE_PATH && !existsSync(process.env.SQLITE_PATH)) {
  writeFileSync(process.env.SQLITE_PATH, readFileSync(process.env.SPIKE_DB_SEED));
}

export const bootTiming: Record<string, number> = { moduleEval: performance.now() };
let booted: Promise<typeof Trails.application> | undefined;
function boot() {
  return (booted ??= (async () => {
    bootTiming.bootStart = performance.now();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await import("../.trails/entry.generated.js");
    bootTiming.initDone = performance.now();
    const { Base } = await import("@blazetrails/activerecord");
    await Base.connectionPool().withConnection((conn) => conn.verifyBang());
    bootTiming.connected = performance.now();
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

const SEED_SQL = [
  "CREATE TABLE IF NOT EXISTS posts (id bigserial PRIMARY KEY, title varchar, created_at timestamp(6) NOT NULL DEFAULT now(), updated_at timestamp(6) NOT NULL DEFAULT now())",
  "INSERT INTO posts (title) SELECT 'Post ' || i FROM generate_series(1, 10) i WHERE NOT EXISTS (SELECT 1 FROM posts)",
];

/** A direct `aws lambda invoke` with `{"seed": true}`; a Function URL event cannot carry a top-level `seed`. */
async function seed(): Promise<{ posts: unknown }> {
  await boot();
  const { Base } = await import("@blazetrails/activerecord");
  const conn = await Base.leaseConnection();
  for (const sql of SEED_SQL) await conn.execute(sql);
  return { posts: await conn.selectValue("SELECT count(*) FROM posts") };
}

export async function handler(
  event: LambdaEvent & { seed?: boolean },
): Promise<LambdaResult | { posts: unknown }> {
  if (event.seed === true) return seed();
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

if (process.env.AWS_LAMBDA_FUNCTION_NAME) await boot();
