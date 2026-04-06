/**
 * Converts between the fetch API (Request/Response) and Rack's env/response
 * tuple format. Runs in the service worker to bridge iframe fetch events
 * to the in-browser Rack app.
 *
 * No Node.js dependencies — uses only browser APIs.
 */

import type { RackEnv, RackResponse, RackBody } from "@blazetrails/rack";

class StringIO {
  private _data: string;
  constructor(data = "") {
    this._data = data;
  }
  read(): string {
    return this._data;
  }
  write(s: string): void {
    this._data += s;
  }
  string(): string {
    return this._data;
  }
  get size(): number {
    return new TextEncoder().encode(this._data).byteLength;
  }
}

/**
 * Build a Rack env dict from a fetch Request.
 * `basePath` is stripped from the URL before setting PATH_INFO
 * (e.g. "/~dev" so that "/~dev/users" becomes "/users").
 */
export function requestToRackEnv(request: Request, basePath = ""): RackEnv {
  const url = new URL(request.url);

  let pathInfo: string;
  try {
    pathInfo = decodeURI(url.pathname);
  } catch {
    pathInfo = url.pathname;
  }
  const normalizedBasePath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  let scriptName = "";
  if (
    normalizedBasePath &&
    (pathInfo === normalizedBasePath || pathInfo.startsWith(`${normalizedBasePath}/`))
  ) {
    scriptName = normalizedBasePath;
    pathInfo = pathInfo.slice(normalizedBasePath.length) || "/";
  }

  const serverPort = url.port || (url.protocol === "https:" ? "443" : "80");

  const env: RackEnv = {
    REQUEST_METHOD: request.method.toUpperCase(),
    PATH_INFO: pathInfo,
    QUERY_STRING: url.search ? url.search.slice(1) : "",
    SERVER_NAME: url.hostname,
    SERVER_PORT: serverPort,
    HTTP_HOST: url.host,
    SERVER_PROTOCOL: "HTTP/1.1",
    SCRIPT_NAME: scriptName,
    HTTPS: url.protocol === "https:" ? "on" : "off",
    "rack.url_scheme": url.protocol.replace(":", ""),
    "rack.input": new StringIO(),
    "rack.errors": new StringIO(),
  };

  // Copy request headers as CGI-style HTTP_* keys
  request.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (normalized === "content-type") {
      env["CONTENT_TYPE"] = value;
    } else if (normalized === "content-length") {
      env["CONTENT_LENGTH"] = value;
    } else {
      env[`HTTP_${key.toUpperCase().replace(/-/g, "_")}`] = value;
    }
  });

  return env;
}

/**
 * Variant that also reads the request body (async).
 * Use this for POST/PUT/PATCH requests.
 */
export async function requestToRackEnvWithBody(request: Request, basePath = ""): Promise<RackEnv> {
  const env = requestToRackEnv(request, basePath);

  const method = request.method.toUpperCase();
  if (request.body && method !== "GET" && method !== "HEAD") {
    const buf = await request.arrayBuffer();
    const body = new TextDecoder().decode(buf);
    env["rack.input"] = new StringIO(body);
    if (!env["CONTENT_LENGTH"]) {
      env["CONTENT_LENGTH"] = String(buf.byteLength);
    }
  }

  return env;
}

/**
 * Convert a Rack response tuple to a fetch Response.
 * Preserves binary data when the body contains Uint8Array chunks.
 */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export async function rackResponseToFetchResponse(rackResponse: RackResponse): Promise<Response> {
  const [status, headers, body] = rackResponse;

  try {
    const responseBody = NULL_BODY_STATUSES.has(status) ? null : await collectBody(body);

    return new Response(responseBody, {
      status,
      headers: new Headers(headers),
    });
  } finally {
    if (body && typeof (body as any).close === "function") {
      (body as any).close();
    }
  }
}

const encoder = new TextEncoder();

async function collectBody(body: RackBody): Promise<string | Uint8Array> {
  const textChunks: string[] = [];
  const binaryChunks: Uint8Array[] = [];
  let hasBinary = false;

  for await (const chunk of body) {
    if (typeof chunk === "string") {
      if (hasBinary) {
        binaryChunks.push(encoder.encode(chunk));
      } else {
        textChunks.push(chunk);
      }
    } else {
      if (!hasBinary) {
        hasBinary = true;
        for (const t of textChunks) {
          binaryChunks.push(encoder.encode(t));
        }
        textChunks.length = 0;
      }
      binaryChunks.push(chunk);
    }
  }

  if (!hasBinary) return textChunks.join("");

  const totalLength = binaryChunks.reduce((n, c) => n + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of binaryChunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}
