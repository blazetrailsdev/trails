import { getHttpAsync, StringIO } from "@blazetrails/activesupport";
import { stderr } from "@blazetrails/ruby-compat";
import type { HttpRequest, HttpResponse, HttpServer } from "@blazetrails/activesupport";
import {
  HTTPS,
  PATH_INFO,
  QUERY_STRING,
  RACK_ERRORS,
  RACK_INPUT,
  RACK_IS_HIJACK,
  RACK_URL_SCHEME,
  REQUEST_METHOD,
  REQUEST_PATH,
  SCRIPT_NAME,
  SERVER_NAME,
  SERVER_PORT,
  SERVER_PROTOCOL,
  SET_COOKIE,
} from "../constants.js";
import { RELEASE } from "../version.js";
import type { RackApp, RackEnv } from "../index.js";

export interface Options {
  Port?: number;
  Host?: string;
}

export class Node {
  static server: HttpServer | null = null;

  readonly app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  static async run(app: RackApp, options: Options = {}): Promise<HttpServer> {
    const handler = new Node(app);
    const http = await getHttpAsync();
    const server = http.createServer((req, res) => {
      void handler.service(req, res);
    });
    Node.server = server;
    return new Promise<HttpServer>((resolve) => {
      server.listen(options.Port ?? 8080, options.Host ?? "localhost", () => resolve(server));
    });
  }

  static async shutdown(): Promise<void> {
    const server = Node.server;
    if (!server) return;
    Node.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  async service(req: HttpRequest, res: HttpResponse): Promise<void> {
    const env = await this.metaVars(req);
    for (const key of Object.keys(env)) {
      if (env[key] == null) delete env[key];
    }

    const input = new StringIO(await readBody(req));

    env[RACK_INPUT] = input;
    env[RACK_ERRORS] = stderr;
    env[RACK_URL_SCHEME] = ["yes", "on", "1"].includes(env[HTTPS] as string) ? "https" : "http";
    env[RACK_IS_HIJACK] = false;

    env[QUERY_STRING] ??= "";
    if (env[PATH_INFO] !== "") {
      const path = new URL(env["REQUEST_URI"] as string).pathname;
      const n = (env[SCRIPT_NAME] as string).length;
      env[PATH_INFO] = path.slice(n, path.length);
    }
    env[REQUEST_PATH] ??= `${env[SCRIPT_NAME] as string}${env[PATH_INFO] as string}`;

    const [status, headers, body] = await this.app(env);
    try {
      const sent: Record<string, string | string[]> = {};
      const setCookie = headers[SET_COOKIE];
      if (setCookie) {
        sent[SET_COOKIE] = Array.isArray(setCookie) ? setCookie : [setCookie];
      }

      for (const [key, value] of Object.entries(headers)) {
        if (key.startsWith("rack.")) continue;
        if (key === SET_COOKIE) continue;
        sent[key] = Array.isArray(value) ? value.join(", ") : value;
      }

      res.writeHead(status, sent);
      for await (const chunk of body) {
        res.write(chunk);
      }
      res.end();
    } finally {
      const close = (body as { return?: () => Promise<unknown> }).return;
      if (close) await close.call(body);
    }
  }

  async metaVars(req: HttpRequest): Promise<RackEnv> {
    const scheme = req.socket.encrypted === true ? "https" : "http";
    const url = parseUri(req.url ?? "/", scheme, header(req, "host") ?? "localhost");
    const meta: RackEnv = {};

    const cl = header(req, "content-length");
    const ct = header(req, "content-type");
    if (cl !== undefined && parseInt(cl, 10) > 0) meta["CONTENT_LENGTH"] = cl;
    if (ct !== undefined) meta["CONTENT_TYPE"] = ct;
    meta["GATEWAY_INTERFACE"] = "CGI/1.1";
    meta[PATH_INFO] = url.pathname;
    meta[QUERY_STRING] = url.search.slice(1);
    meta["REMOTE_ADDR"] = req.socket.remoteAddress ?? "";
    meta["REMOTE_HOST"] = req.socket.remoteAddress ?? "";
    meta["REMOTE_USER"] = undefined;
    meta[REQUEST_METHOD] = (req.method ?? "GET").toUpperCase();
    meta["REQUEST_URI"] = url.href;
    meta[SCRIPT_NAME] = "";
    meta[SERVER_NAME] = url.hostname;
    meta[SERVER_PORT] = url.port === "" ? (scheme === "https" ? "443" : "80") : url.port;
    meta[SERVER_PROTOCOL] = `HTTP/${req.httpVersion ?? "1.1"}`;
    meta["SERVER_SOFTWARE"] = `trails/${RELEASE}`;
    if (scheme === "https") meta[HTTPS] = "on";

    for (const [key, rawValue] of Object.entries(req.headers)) {
      if (/^content-type$/i.test(key)) continue;
      if (/^content-length$/i.test(key)) continue;
      if (rawValue === undefined) continue;
      const name = `HTTP_${key.replace(/-/g, "_").toUpperCase()}`;
      meta[name] = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    }

    return meta;
  }
}

function parseUri(str: string, scheme: string, host: string): URL {
  return new URL(str.replace(/^\/+/, "/"), `${scheme}://${host}`);
}

function header(req: HttpRequest, name: string): string | undefined {
  const value = req.headers[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(", ") : value;
}

/** @noRailsEquivalent PERMANENT */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

function readBody(req: HttpRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let totalLength = 0;
    req.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(binaryString(chunk));
    });
    req.on("end", () => resolve(chunks.join("")));
    req.on("error", reject);
  });
}

/** @noRailsEquivalent PERMANENT */
function binaryString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}
