/**
 * The Node handler — trails' `Rackup::Handler::WEBrick`
 * (`rackup-2.2.1/lib/rackup/handler/webrick.rb`), a servlet: `self.run` builds
 * the server and mounts it at "/", and `#service` turns one request into a Rack
 * env, calls the app, and writes the tuple back. The server is reached through
 * ActiveSupport's HTTP adapter. WEBrick's servlet gets a request that already
 * knows its CGI meta variables; a Node request does not, so {@link
 * Node.metaVars} ports `WEBrick::HTTPRequest#meta_vars`
 * (`webrick-1.9.1/lib/webrick/httprequest.rb:407-440`) too.
 */

import { getHttpAsync, StringIO, stderr } from "@blazetrails/activesupport";
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
import type { RackApp, RackBody, RackEnv } from "../index.js";

/** `Rackup::Handler::WEBrick.valid_options` — `:Host` and `:Port`. */
export interface Options {
  Port?: number;
  Host?: string;
}

export class Node {
  /** `webrick.rb:31` — the `@server` class ivar `self.shutdown` reads back. */
  static server: HttpServer | null = null;

  readonly app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  /**
   * `Rackup::Handler::WEBrick.run(app, **options)` (`webrick.rb:19-35`) — build
   * the server, mount the servlet, start listening. `options[:Port] ||= 8080`
   * and the `default_host` of `"localhost"` are Rails' defaults; Ruby's
   * `@server.start` blocks, so this resolves once the socket is bound instead.
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

  /** `Rackup::Handler::WEBrick.shutdown` (`webrick.rb:47-52`). */
  static async shutdown(): Promise<void> {
    const server = Node.server;
    if (!server) return;
    Node.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  /**
   * `Rackup::Handler::WEBrick#service(req, res)` (`webrick.rb:91-157`).
   *
   * Three of Rails' arms branch on shapes this port does not have:
   * `RACK_IS_HIJACK` is `true` at `webrick.rb:101` because WEBrick can hand the
   * servlet its socket, while {@link HttpResponse} exposes only `writeHead` /
   * `write` / `end` — nothing to surrender, so it is `false` and the
   * `rack.hijack` / `io_lambda` / `res.upgrade!` arms (`webrick.rb:115-121`,
   * `:137-144`) cannot be reached; `body.respond_to?(:to_path)`
   * (`webrick.rb:145`) selects a file body, but {@link RackBody} is always an
   * async iterable, leaving Rails' `body.each` arm (`webrick.rb:148-152`); and
   * `body.close` (`webrick.rb:155`) is what `for await` itself performs when
   * the loop ends or throws.
   */
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
      const path = env[PATH_INFO] as string;
      const n = (env[SCRIPT_NAME] as string).length;
      env[PATH_INFO] = path.slice(n, path.length);
    }
    env[REQUEST_PATH] ??= `${env[SCRIPT_NAME] as string}${env[PATH_INFO] as string}`;

    const [status, headers, body] = await this.app(env);

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
  }

  /**
   * `WEBrick::HTTPRequest#meta_vars` (`httprequest.rb:407-440`). `REMOTE_USER`
   * is WEBrick's authenticated user, which nothing here can populate; Rails
   * assigns it anyway and `service`'s `delete_if { |k, v| v.nil? }`
   * (`webrick.rb:93`) sweeps it back out, so this does the same.
   *
   * `HTTPS` is set by `webrick/https.rb:67-70`'s override of this method rather
   * than by the handler, so a TLS socket is read here too.
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
    meta["REMOTE_HOST"] = req.socket.remoteAddress ?? "";
    meta["REMOTE_USER"] = undefined;
    meta[REQUEST_METHOD] = (req.method ?? "GET").toUpperCase();
    meta["REQUEST_URI"] = req.url ?? "/";
    meta[SCRIPT_NAME] = "";
    meta[SERVER_NAME] = url.hostname;
    meta[SERVER_PORT] = url.port === "" ? (url.protocol === "https:" ? "443" : "80") : url.port;
    meta[SERVER_PROTOCOL] = `HTTP/${req.httpVersion ?? "1.1"}`;
    meta["SERVER_SOFTWARE"] = `trails/${RELEASE}`;
    if (req.socket.encrypted === true) meta[HTTPS] = "on";

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

/** `WEBrick::HTTPRequest#[]` — one header, however Node spelled its value. */
function header(req: HttpRequest, name: string): string | undefined {
  const value = req.headers[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(", ") : value;
}

/**
 * The body behind `Rackup::Handler::WEBrick::Input` (`webrick.rb:60-89`), whose
 * `Stream::Reader` `Fiber` resumes `req.body` one chunk per `read` so a large
 * upload never lands in memory whole. JS has no coroutine that can suspend an
 * async read inside the synchronous `read()` the Rack input contract requires,
 * so the body is drained up front into the `StringIO` `service` hands over —
 * the shape `mock-request.ts:147` already builds for `rack.input`.
 *
 * @noRailsEquivalent PERMANENT — `MAX_BODY_SIZE` follows from that buffering,
 * not from Rails: `:InputBufferSize` (`webrick/config.rb:59`) is a per-chunk
 * read size and `RequestEntityTooLarge` (`httprequest.rb:481`) guards headers,
 * so Rails bounds this body nowhere. Draining it without Rails' backpressure is
 * what makes a ceiling necessary.
 */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

function readBody(req: HttpRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let totalLength = 0;
    const decoder = new TextDecoder("utf-8");
    req.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(decoder.decode(chunk, { stream: true }));
    });
    req.on("end", () => resolve(chunks.join("") + decoder.decode()));
    req.on("error", reject);
  });
}
