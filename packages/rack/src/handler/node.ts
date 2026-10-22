import {
  EOFError,
  getHttpAsync,
  stderr,
  StringIO,
  TCPSocket,
  Thread,
  rbFSend,
} from "@blazetrails/ruby-compat";
import type { HttpRequest, HttpResponse, HttpServer, HttpSocket } from "@blazetrails/ruby-compat";
import {
  HTTPS,
  PATH_INFO,
  QUERY_STRING,
  RACK_ERRORS,
  RACK_HIJACK,
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
import { HTTP_STATUS_CODES } from "../utils.js";
import { RELEASE } from "../version.js";
import type { RackApp, RackEnv, RackMiddleware, RackResponse } from "../index.js";

/** @noRailsEquivalent PERMANENT */
export interface Options {
  /** @noRailsEquivalent PERMANENT */
  Port?: number;
  /** @noRailsEquivalent PERMANENT */
  Host?: string;
}

/** @noRailsEquivalent PERMANENT */
const unhijacked = new Set<HttpSocket>();

/** @noRailsEquivalent PERMANENT */
export class Node {
  /** @noRailsEquivalent PERMANENT */
  static server: HttpServer | null = null;

  /** @noRailsEquivalent PERMANENT */
  readonly app: RackApp | RackMiddleware;

  /** @noRailsEquivalent PERMANENT */
  constructor(app: RackApp | RackMiddleware) {
    this.app = app;
  }

  /** @noRailsEquivalent PERMANENT */
  static async run(app: RackApp, options: Options = {}): Promise<HttpServer> {
    const handler = new Node(app);
    const http = await getHttpAsync();
    const server = http.createServer((req, res) => {
      void handler.service(req, res);
    });
    server.on("upgrade", (req, socket, head) => {
      void handler.upgrade(req, socket, head);
    });
    Node.server = server;
    return new Promise<HttpServer>((resolve) => {
      server.listen(options.Port ?? 8080, options.Host ?? "localhost", () => resolve(server));
    });
  }

  /** @noRailsEquivalent PERMANENT */
  static async shutdown(): Promise<void> {
    const server = Node.server;
    if (!server) return;
    Node.server = null;
    for (const socket of unhijacked) socket.destroy();
    unhijacked.clear();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  /** @noRailsEquivalent PERMANENT */
  service(req: HttpRequest, res: HttpResponse): Promise<void> {
    return new Thread(async (): Promise<void> => {
      const env = await this.requestEnv(req, new StringIO(await readBody(req)));
      const socket = res.socket;
      let hijacked = false;
      let io: TCPSocket | undefined;
      const release = (): TCPSocket => {
        hijacked = true;
        return (io ??= new TCPSocket(socket!));
      };
      env[RACK_IS_HIJACK] = socket != null;
      if (env[RACK_IS_HIJACK]) env[RACK_HIJACK] = release;

      try {
        const [status, headers, body] = await (rbFSend(
          this.app,
          "call",
          env,
        ) as Promise<RackResponse>);
        try {
          if (hijacked) return;
          const partial = headers[RACK_HIJACK];
          if (env[RACK_IS_HIJACK] && typeof partial === "function") {
            const stream = release();
            stream.write(responseHead(status, sentHeaders(headers)));
            await partial(stream);
            return;
          }
          res.writeHead(status, sentHeaders(headers));
          for await (const chunk of body) {
            if (hijacked) return;
            res.write(chunk);
          }
          res.end();
        } finally {
          await closeBody(body);
        }
      } catch (error) {
        if (!hijacked) throw error;
        stderr.write(
          `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
      }
    }).value();
  }

  /** @noRailsEquivalent PERMANENT */
  upgrade(req: HttpRequest, socket: HttpSocket, head: Uint8Array): Promise<void> {
    return new Thread(async (): Promise<void> => {
      let hijacked = false;
      let started = false;
      let io: TCPSocket | undefined;
      const discard = (): void => {
        socket.destroy();
      };
      const release = (): void => {
        hijacked = true;
        unhijacked.delete(socket);
        socket.removeListener("error", discard);
        io ??= new TCPSocket(socket);
      };
      socket.on("error", discard);
      unhijacked.add(socket);
      socket.on("close", () => {
        unhijacked.delete(socket);
      });

      try {
        const length = Number(header(req, "content-length") ?? 0);
        let input: string | Uint8Array = "";
        if (!(length > 0)) {
          if (head.length > 0) socket.unshift(head);
        } else {
          if (length > MAX_BODY_SIZE) throw new Error("Request body too large");
          const bodyBytes = new Uint8Array(length);
          let n = Math.min(length, head.length);
          bodyBytes.set(head.subarray(0, n));
          if (head.length > n) socket.unshift(head.subarray(n));
          if (n < length) {
            await new Promise<void>((resolve, reject) => {
              const onEnd = (): void => {
                socket.removeListener("data", onData);
                socket.removeListener("end", onEnd);
                socket.removeListener("close", onEnd);
                reject(new EOFError("end of file reached"));
              };
              const onData = (chunk: Uint8Array): void => {
                const take = Math.min(length - n, chunk.length);
                bodyBytes.set(chunk.subarray(0, take), n);
                n += take;
                if (n < length) return;
                socket.pause();
                socket.removeListener("data", onData);
                socket.removeListener("end", onEnd);
                socket.removeListener("close", onEnd);
                if (take < chunk.length) socket.unshift(chunk.subarray(take));
                resolve();
              };
              socket.on("data", onData);
              socket.on("end", onEnd);
              socket.on("close", onEnd);
              socket.resume();
            });
          }
          input = bodyBytes;
        }
        const env = await this.requestEnv(req, new StringIO(input));
        env[RACK_IS_HIJACK] = true;
        env[RACK_HIJACK] = (): TCPSocket => {
          release();
          return io!;
        };

        const [status, headers, body] = await (rbFSend(
          this.app,
          "call",
          env,
        ) as Promise<RackResponse>);
        try {
          if (hijacked) return;
          const partial = headers[RACK_HIJACK] as unknown;
          if (typeof partial === "function") {
            started = true;
            socket.write(responseHead(status, sentHeaders(headers)));
            release();
            await (partial as (stream: TCPSocket) => unknown)(io!);
            return;
          }
          started = true;
          socket.write(responseHead(status, sentHeaders(headers)));
          for await (const chunk of body) {
            if (hijacked) return;
            socket.write(chunk);
          }
          socket.end();
        } finally {
          await closeBody(body);
        }
      } catch (error) {
        stderr.write(
          `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
        if (hijacked) return;
        if (started) socket.destroy();
        else socket.end(responseHead(500, { "content-length": "0" }));
      }
    }).value();
  }

  /** @internal */
  private async requestEnv(
    req: HttpRequest,
    input: StringIO<string | Uint8Array>,
  ): Promise<RackEnv> {
    const env = await this.metaVars(req);
    for (const key of Object.keys(env)) {
      if (env[key] == null) delete env[key];
    }

    env[RACK_INPUT] = input;
    env[RACK_ERRORS] = stderr;
    env[RACK_URL_SCHEME] = ["yes", "on", "1"].includes(env[HTTPS] as string) ? "https" : "http";

    env[QUERY_STRING] ??= "";
    if (env[PATH_INFO] !== "") {
      const path = new URL(env["REQUEST_URI"] as string).pathname;
      const n = (env[SCRIPT_NAME] as string).length;
      env[PATH_INFO] = path.slice(n, path.length);
    }
    env[REQUEST_PATH] ??= `${env[SCRIPT_NAME] as string}${env[PATH_INFO] as string}`;
    return env;
  }

  /** @noRailsEquivalent PERMANENT */
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

/** @noRailsEquivalent PERMANENT */
function sentHeaders(headers: RackResponse[1]): Record<string, string | string[]> {
  const sent: Record<string, string | string[]> = {};
  const setCookie = headers[SET_COOKIE];
  if (setCookie && typeof setCookie !== "function") {
    sent[SET_COOKIE] = Array.isArray(setCookie) ? setCookie : [setCookie];
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.startsWith("rack.")) continue;
    if (key === SET_COOKIE) continue;
    if (typeof value === "function") continue;
    sent[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return sent;
}

/** @noRailsEquivalent PERMANENT */
async function closeBody(body: RackResponse[2]): Promise<void> {
  const { close, return: finish } = body as {
    close?: () => void;
    return?: () => Promise<unknown>;
  };
  if (close) close.call(body);
  else if (finish) await finish.call(body);
}

/** @noRailsEquivalent PERMANENT */
function responseHead(status: number, headers: Record<string, string | string[]>): string {
  const lines = [`HTTP/1.1 ${status} ${HTTP_STATUS_CODES[status] ?? ""}`.trimEnd()];
  let connection = false;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "connection") connection = true;
    for (const each of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${each}`);
  }
  if (!connection) lines.push("connection: close");
  return `${lines.join("\r\n")}\r\n\r\n`;
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

function readBody(req: HttpRequest): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    req.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(body);
    });
    req.on("error", reject);
  });
}
