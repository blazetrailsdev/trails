import {
  EOFError,
  getHttpAsync,
  stderr,
  stdout,
  STDERR,
  StringIO,
  TCPSocket,
  Queue,
  Thread,
  rbObjAsString,
  rbProcCall,
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
  STATUS_WITH_NO_ENTITY_BODY,
  HTTP_STATUS_CODES,
  RELEASE,
} from "@blazetrails/rack";
import type { RackApp, RackEnv, RackMiddleware, RackResponse } from "@blazetrails/rack";
import { Handler } from "../handler.js";

/** @noRailsEquivalent PERMANENT */
export interface Options {
  /** @noRailsEquivalent PERMANENT */
  Port?: number;
  /** @noRailsEquivalent PERMANENT */
  Host?: string;
  /** @noRailsEquivalent PERMANENT */
  persistentTimeout?: number;
}

/** @noRailsEquivalent PERMANENT */
const unhijacked = new Set<HttpSocket>();

/** @perf 7us — PERMANENT */
class _ThreadPool {
  /** @noRailsEquivalent PERMANENT */
  spawned = 0;
  /** @noRailsEquivalent PERMANENT */
  waiting = 0;
  /** @noRailsEquivalent PERMANENT */
  min: number;
  /** @noRailsEquivalent PERMANENT */
  max: number;
  readonly #todo = new Queue<() => Promise<void>>();
  readonly #name: string;
  readonly #processors: Thread<Promise<void>>[] = [];

  /** @noRailsEquivalent PERMANENT */
  constructor(name: string, options: { minThreads: number; maxThreads: number }) {
    this.#name = name;
    this.min = options.minThreads;
    this.max = options.maxThreads;
    for (let i = 0; i < this.min; i++) this.#spawnThread();
  }

  /** @inventedArm for — PERMANENT */
  #spawnThread(): void {
    this.spawned += 1;
    const processor = new Thread(
      this,
      this.spawned,
      async (_pool: _ThreadPool, spawned: number) => {
        Thread.current().name = `${this.#name} tp ${String(spawned).padStart(3, "0")}`;
        const todo = this.#todo;
        while (true) {
          this.waiting += 1;
          let work: (() => Promise<void>) | null;
          try {
            work = await todo.pop();
          } finally {
            this.waiting -= 1;
          }
          if (work == null) return;
          try {
            await work();
          } finally {
            const thread = Thread.current();
            for (const key of thread.keys()) thread.set(key, null);
          }
        }
      },
    );
    this.#processors.push(processor);
  }

  push(work: () => Promise<void>): this {
    this.#todo.push(work);
    if (this.waiting < this.#todo.length && this.spawned < this.max) this.#spawnThread();
    return this;
  }
}

/** @noRailsEquivalent PERMANENT */
export class Node {
  /** @noRailsEquivalent PERMANENT */
  static server: HttpServer | null = null;

  /** @noRailsEquivalent PERMANENT */
  readonly app: RackApp | RackMiddleware;

  /** @noRailsEquivalent PERMANENT */
  readonly threadPool = new _ThreadPool("trails", { minThreads: 0, maxThreads: 5 });

  /** @noRailsEquivalent PERMANENT */
  constructor(app: RackApp | RackMiddleware) {
    this.app = app;
  }

  /** @perf 7us — PERMANENT */
  _process(work: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.threadPool.push(() => work().then(resolve, reject));
    });
  }

  /** @noRailsEquivalent PERMANENT */
  static async run(app: RackApp | RackMiddleware, options: Options = {}): Promise<HttpServer> {
    const handler = new Node(app);
    const http = await getHttpAsync();
    const server = http.createServer((req, res) => {
      handler.service(req, res).catch((error: unknown) => {
        stderr.write(
          `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
        if (res.writableEnded) return;
        if (res.headersSent) {
          res.socket?.destroy();
          return;
        }
        res.writeHead(500, { "content-length": "0" });
        res.end();
      });
    });
    if (options.persistentTimeout != null) {
      server.keepAliveTimeout = options.persistentTimeout * 1000;
      server.headersTimeout = server.keepAliveTimeout + 1000;
    }
    server.on("upgrade", (req, socket, head) => {
      handler.upgrade(req, socket, head).catch((error: unknown) => {
        stderr.write(
          `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
        socket.destroy();
      });
    });
    Node.server = server;
    const host = options.Host ?? "localhost";
    return new Promise<HttpServer>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.Port ?? 8080, host, () => {
        server.off("error", reject);
        const address = server.address();
        const port = typeof address === "object" && address !== null ? address.port : options.Port;
        stdout.write(`* Listening on http://${host}:${port}\n`);
        resolve(server);
      });
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
    return this._process(async (): Promise<void> => {
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

      let closing: Promise<void> | null = null;
      try {
        const [status, headers, body] = await (rbProcCall(this.app, env) as Promise<RackResponse>);
        try {
          if (hijacked) return;
          const partial = headers[RACK_HIJACK];
          if (env[RACK_IS_HIJACK] && typeof partial === "function") {
            const stream = release();
            stream.write(responseHead(status, sentHeaders(headers)));
            await partial(stream);
            return;
          }
          const ary = _arrayBody(env, status, headers, body);
          if (ary !== null) {
            const sent = sentHeaders(headers);
            sent["content-length"] = String(
              ary.reduce((n, chunk) => n + Buffer.byteLength(chunk), 0),
            );
            res.writeHead(status, sent);
            res.end(ary.length === 1 ? ary[0] : Buffer.concat(ary.map((c) => Buffer.from(c))));
            return;
          }
          res.writeHead(status, sentHeaders(headers));
          let wake: (() => void) | null = null;
          const onClose = (): void => {
            closing ??= closeBody(body);
            wake?.();
          };
          const onDrain = (): void => wake?.();
          res.on("close", onClose);
          res.on("drain", onDrain);
          if (res.destroyed) onClose();
          try {
            for await (const chunk of body) {
              if (hijacked) return;
              if (closing) break;
              if (res.write(rbObjAsString(chunk)) === false)
                await new Promise<void>((resolve) => (wake = resolve));
              wake = null;
            }
          } finally {
            res.removeListener("close", onClose);
            res.removeListener("drain", onDrain);
          }
          if (closing) return await closing;
          res.end();
        } finally {
          await (closing ?? closeBody(body));
        }
      } catch (error) {
        if (!hijacked) throw error;
        stderr.write(
          `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
      }
    });
  }

  /** @noRailsEquivalent PERMANENT */
  upgrade(req: HttpRequest, socket: HttpSocket, head: Uint8Array): Promise<void> {
    return this._process(async (): Promise<void> => {
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
          const parsed: Uint8Array[] = [];
          await new Promise<void>((resolve, reject) => {
            const onData = (chunk: Uint8Array): void => {
              parsed.push(chunk);
            };
            req.on("data", onData);
            req.once("end", () => {
              req.removeListener("data", onData);
              resolve();
            });
            req.once("error", (error) => {
              req.removeListener("data", onData);
              reject(error);
            });
          });
          const buffered = Buffer.concat([...parsed, head]);
          const bodyBytes = new Uint8Array(length);
          let n = Math.min(length, buffered.length);
          bodyBytes.set(buffered.subarray(0, n));
          if (buffered.length > n) socket.unshift(buffered.subarray(n));
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

        const [status, headers, body] = await (rbProcCall(this.app, env) as Promise<RackResponse>);
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
            socket.write(rbObjAsString(chunk));
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
        if (socket.writableEnded) return;
        if (started) socket.destroy();
        else socket.end(responseHead(500, { "content-length": "0" }));
      }
    });
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
    env[RACK_ERRORS] = STDERR;
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

/** @perf 20% — PERMANENT */
function _arrayBody(
  env: RackEnv,
  status: number,
  headers: RackResponse[1],
  body: unknown,
): (string | Uint8Array)[] | null {
  if (
    env[REQUEST_METHOD] === "HEAD" ||
    status === 205 ||
    Object.hasOwn(STATUS_WITH_NO_ENTITY_BODY, status)
  ) {
    return null;
  }
  for (const key of Object.keys(headers)) {
    const name = key.toLowerCase();
    if (name === "content-length" || name === "transfer-encoding") return null;
  }
  const toAry = (body as { toAry?: () => unknown } | null)?.toAry;
  const ary = Array.isArray(body) ? body : typeof toAry === "function" ? toAry.call(body) : null;
  if (!Array.isArray(ary)) return null;
  for (const chunk of ary) {
    if (typeof chunk !== "string" && !(chunk instanceof Uint8Array)) return null;
  }
  return ary as (string | Uint8Array)[];
}

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
    if (value == null) continue;
    sent[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return sent;
}

/** @noRailsEquivalent PERMANENT */
async function closeBody(body: RackResponse[2]): Promise<void> {
  const { close, return: finish } = body as {
    close?: () => unknown;
    return?: () => Promise<unknown>;
  };
  if (close) await close.call(body);
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

Handler.Node = Node;
Handler.register("node", Node);
