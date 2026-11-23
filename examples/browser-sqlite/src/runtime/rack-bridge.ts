import type { RackBody, RackEnv, RackResponse } from "@blazetrails/rack";

class StringIO {
  constructor(private data = "") {}
  read(): string {
    return this.data;
  }
  write(s: string): void {
    this.data += s;
  }
  string(): string {
    return this.data;
  }
}

/** The Rack env for a request the service worker forwarded, mounted at `scriptName`. */
export function rackEnv(
  method: string,
  href: string,
  headers: [string, string][],
  body: ArrayBuffer | null,
  scriptName: string,
): RackEnv {
  const url = new URL(href);
  const path = decodeURI(url.pathname);
  const pathInfo = path.startsWith(scriptName) ? path.slice(scriptName.length) || "/" : path;
  const input = body ? new TextDecoder().decode(body) : "";
  const env: RackEnv = {
    REQUEST_METHOD: method.toUpperCase(),
    SCRIPT_NAME: scriptName,
    PATH_INFO: pathInfo,
    QUERY_STRING: url.search.slice(1),
    SERVER_NAME: url.hostname,
    SERVER_PORT: url.port || (url.protocol === "https:" ? "443" : "80"),
    SERVER_PROTOCOL: "HTTP/1.1",
    HTTP_HOST: url.host,
    HTTPS: url.protocol === "https:" ? "on" : "off",
    REMOTE_ADDR: "127.0.0.1",
    "rack.url_scheme": url.protocol.slice(0, -1),
    "rack.input": new StringIO(input),
    "rack.errors": new StringIO(),
  };
  if (body) env.CONTENT_LENGTH = String(body.byteLength);
  for (const [name, value] of headers) {
    const key = name.toLowerCase();
    if (key === "content-type") env.CONTENT_TYPE = value;
    else if (key === "content-length") env.CONTENT_LENGTH = value;
    else env[`HTTP_${key.toUpperCase().replace(/-/g, "_")}`] = value;
  }
  return env;
}

const NULL_BODY = new Set([101, 204, 205, 304]);

/** A Rack response as the status, header pairs and bytes the service worker answers with. */
export async function rackResult(
  response: RackResponse,
): Promise<{ status: number; headers: [string, string][]; body: Uint8Array | null }> {
  const [status, headers, body] = response;
  try {
    const pairs: [string, string][] = [];
    for (const [name, value] of Object.entries(headers)) {
      for (const v of [value].flat()) {
        if (v != null) for (const line of String(v).split("\n")) pairs.push([name, line]);
      }
    }
    return { status, headers: pairs, body: NULL_BODY.has(status) ? null : await collect(body) };
  } finally {
    const closable = body as { close?: () => unknown } | null;
    if (typeof closable?.close === "function") await closable.close();
  }
}

async function collect(body: RackBody): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for await (const raw of body as AsyncIterable<unknown>) {
    chunks.push(raw instanceof Uint8Array ? raw : encoder.encode(String(raw)));
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
