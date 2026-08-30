/**
 * The Node handler — trails' `Rackup::Handler::WEBrick`.
 *
 * WEBrick's handler is a servlet: `self.run` builds the server and mounts the
 * servlet at "/", and `#service(req, res)` turns one WEBrick request into a
 * Rack env, calls the app, and writes the tuple back out. This mirrors that
 * split, over a `node:http` server reached through ActiveSupport's HTTP
 * adapter rather than a direct import.
 *
 * WEBrick hands the servlet a request that already knows its CGI meta
 * variables (`WEBrick::HTTPRequest#meta_vars`); a Node request does not, so
 * {@link Node.metaVars} ports that method too.
 */

import { getHttpAsync, stderr } from "@blazetrails/activesupport";
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
} from "../constants.js";
import type { RackApp, RackEnv } from "../index.js";

export interface Options {
  /** WEBrick's `:Port`. */
  Port?: number;
  /** WEBrick's `:Host` — the address to bind. */
  Host?: string;
}

/**
 * The maximum request body the handler will buffer. WEBrick has
 * `:InputBufferSize` and a `RequestEntityTooLarge` response; a Node request is
 * a stream with no such ceiling, so one is imposed here.
 */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

export class Node {
  static server: HttpServer | null = null;

  readonly app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  /**
   * `Rackup::Handler::WEBrick.run(app, **options)` — build the server, mount
   * the servlet, and start listening. Ruby's `@server.start` blocks; a Node
   * server does not, so this resolves once the socket is bound.
   */
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

  /** `Rackup::Handler::WEBrick.shutdown`. */
  static async shutdown(): Promise<void> {
    const server = Node.server;
    if (!server) return;
    Node.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  /** `Rackup::Handler::WEBrick#service(req, res)`. */
  async service(req: HttpRequest, res: HttpResponse): Promise<void> {
    const env = await this.metaVars(req);

    env[RACK_INPUT] = await readBody(req);
    env[RACK_ERRORS] = stderr;
    env[RACK_URL_SCHEME] = urlScheme(req, env);
    env[RACK_IS_HIJACK] = false;

    env[QUERY_STRING] ??= "";
    env[REQUEST_PATH] ??= `${env[SCRIPT_NAME] as string}${env[PATH_INFO] as string}`;

    const [status, headers, body] = await this.app(env);

    res.writeHead(status, headers);
    for await (const chunk of body) {
      res.write(chunk);
    }
    res.end();
  }

  /**
   * `WEBrick::HTTPRequest#meta_vars` — the CGI variables a servlet's request
   * arrives already carrying. Node's request carries only the request line and
   * the headers, so the URL is what `REQUEST_URI` would have been parsed from.
   */
  async metaVars(req: HttpRequest): Promise<RackEnv> {
    const url = new URL(req.url ?? "/", `http://${header(req, "host") ?? "localhost"}`);
    const meta: RackEnv = {};

    const cl = header(req, "content-length");
    const ct = header(req, "content-type");
    if (cl !== undefined && parseInt(cl, 10) > 0) meta["CONTENT_LENGTH"] = cl;
    if (ct !== undefined) meta["CONTENT_TYPE"] = ct;
    meta["GATEWAY_INTERFACE"] = "CGI/1.1";
    meta[PATH_INFO] = url.pathname;
    meta[QUERY_STRING] = url.search.slice(1);
    meta["REMOTE_ADDR"] = req.socket.remoteAddress ?? "";
    meta[REQUEST_METHOD] = (req.method ?? "GET").toUpperCase();
    meta["REQUEST_URI"] = req.url ?? "/";
    meta[SCRIPT_NAME] = "";
    meta[SERVER_NAME] = url.hostname;
    meta[SERVER_PORT] = url.port === "" ? (url.protocol === "https:" ? "443" : "80") : url.port;
    meta[SERVER_PROTOCOL] = `HTTP/${req.httpVersion ?? "1.1"}`;
    meta["SERVER_SOFTWARE"] = "trails";

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

/**
 * WEBrick decides the scheme from `env["HTTPS"]`; behind a Node server the TLS
 * fact lives on the socket, and a reverse proxy states it in
 * `X-Forwarded-Proto`.
 */
function urlScheme(req: HttpRequest, env: RackEnv): string {
  if (["yes", "on", "1"].includes(env[HTTPS] as string)) return "https";
  if (req.socket.encrypted === true) return "https";
  const forwarded = (env["HTTP_X_FORWARDED_PROTO"] as string | undefined) ?? "";
  if (forwarded.split(",").some((proto) => proto.trim().toLowerCase() === "https")) return "https";
  return "http";
}

function header(req: HttpRequest, name: string): string | undefined {
  const value = req.headers[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(", ") : value;
}

/** `StringIO.new(req.body.to_s)` — WEBrick has already read the body. */
function readBody(req: HttpRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let totalLength = 0;
    const decoder = new TextDecoder("utf-8");
    req.on("data", ((chunk: Uint8Array) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(decoder.decode(chunk, { stream: true }));
    }) as (...args: never[]) => void);
    req.on("end", (() => resolve(chunks.join("") + decoder.decode())) as () => void);
    req.on("error", reject as (...args: never[]) => void);
  });
}
