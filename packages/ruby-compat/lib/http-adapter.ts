import { WriteTimeout } from "./net/protocol.js";
import { rbStrDump } from "./string/convert.js";

export interface HttpRequest {
  method?: string | undefined;
  url?: string | undefined;
  httpVersion?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string | undefined; encrypted?: boolean | undefined };
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "end" | "error", listener: (error: Error) => void): unknown;
  once(event: "end" | "error", listener: (error: Error) => void): unknown;
  removeListener(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  destroy(): unknown;
}

export interface HttpResponse {
  readonly headersSent: boolean;
  readonly writableEnded: boolean;
  writeHead(status: number, headers?: Record<string, string | string[]>): unknown;
  write(chunk: string | Uint8Array): unknown;
  end(chunk?: string | Uint8Array): unknown;
  socket?: HttpSocket | null;
}

/** @noRailsEquivalent PERMANENT */
export interface HttpSocket {
  readonly writableEnded: boolean;
  readonly writableLength: number;
  readonly writableHighWaterMark: number;
  write(chunk: string | Uint8Array): unknown;
  end(chunk?: string | Uint8Array): unknown;
  destroy(): unknown;
  unshift(chunk: Uint8Array): unknown;
  pause(): unknown;
  resume(): unknown;
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "close" | "end" | "drain", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  removeListener(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  removeListener(event: "close" | "end", listener: () => void): unknown;
  removeListener(event: "error", listener: (error: Error) => void): unknown;
}

/** @noRailsEquivalent PERMANENT */
export type HttpUpgradeListener = (req: HttpRequest, socket: HttpSocket, head: Uint8Array) => void;

export interface HttpServer {
  listen(port: number, host: string, listener?: () => void): unknown;
  close(callback?: (error?: Error) => void): unknown;
  address(): string | { port: number } | null;
  on(event: "upgrade", listener: HttpUpgradeListener): unknown;
  on(event: "close", listener: () => void): unknown;
}

/** @noRailsEquivalent PERMANENT */
export interface HttpClientResponse {
  httpVersion: string;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}

/** @noRailsEquivalent PERMANENT */
export interface HttpClientConnection {
  request(
    method: string,
    path: string,
    headers: Record<string, string[]>,
    body: string | Uint8Array | null,
  ): Promise<HttpClientResponse>;
  close(): void;
  isClosed(): boolean;
  isEof(): boolean;
  /** `BufferedIO#write_timeout` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:129`). */
  writeTimeout: number | null;
  /** `BufferedIO#debug_output` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:131`). */
  debugOutput: HttpDebugOutput | null;
  readonly sslVersion: string | null;
  readonly cipher: string[] | null;
}

/** @noRailsEquivalent PERMANENT */
export interface HttpDebugOutput {
  write(str: string): unknown;
}

/** @noRailsEquivalent PERMANENT */
export interface HttpConnectOptions {
  host: string;
  port: number;
  useSsl: boolean;
  sslHostAddress: string | null;
  verifyPeer: boolean;
  writeTimeout: number | null;
  debugOutput: HttpDebugOutput | null;
}

export interface HttpAdapter {
  createServer(handler: (req: HttpRequest, res: HttpResponse) => void): HttpServer;
  connect?(options: HttpConnectOptions): Promise<HttpClientConnection>;
}

const registry = new Map<string, HttpAdapter>();
let currentAdapterName: string | null = null;
let resolved: HttpAdapter | null = null;

/** @noRailsEquivalent PERMANENT */
export function registerHttpAdapter(name: string, adapter: HttpAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

/** @noRailsEquivalent PERMANENT */
interface NodeProcess {
  versions?: { node?: string };
  getBuiltinModule?(id: string): unknown;
}

function nodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

/** @noRailsEquivalent PERMANENT */
declare const require: ((id: string) => unknown) | undefined;

function syncBuiltinLoader(): ((id: string) => unknown) | null {
  const proc = nodeProcess();
  const getBuiltinModule = proc?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") return (id) => getBuiltinModule.call(proc, id);
  if (typeof require === "undefined") return null;
  const nodeModule = require("node:module") as {
    createRequire(p: string): (id: string) => unknown;
  };
  return nodeModule.createRequire("file:///ruby-compat");
}

type NodeSocket = {
  once(event: string, listener: (error?: Error) => void): unknown;
  removeListener(event: string, listener: (error?: Error) => void): unknown;
  destroy(): unknown;
  readonly destroyed: boolean;
  readonly readableEnded: boolean;
  on(event: "drain", listener: () => void): unknown;
  getProtocol?(): string | null;
  getCipher?(): { name: string };
};

type NodeIncoming = {
  httpVersion: string;
  statusCode?: number;
  statusMessage?: string;
  headers: Record<string, string | string[] | undefined>;
  rawHeaders: string[];
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
};

type NodeHttp = {
  createServer: (handler: (req: HttpRequest, res: HttpResponse) => void) => HttpServer;
  request(
    options: Record<string, unknown>,
    callback: (res: NodeIncoming) => void,
  ): {
    on(event: "error", listener: (error: Error) => void): unknown;
    once(event: "finish", listener: () => void): unknown;
    end(chunk?: string | Uint8Array | null): unknown;
  };
};

type NodeNet = { connect(options: Record<string, unknown>): NodeSocket };

function _nodeConnect(net: NodeNet, tls: NodeNet, options: HttpConnectOptions, http: NodeHttp) {
  return new Promise<HttpClientConnection>((resolve, reject) => {
    const socket = options.useSsl
      ? tls.connect({
          host: options.host,
          port: options.port,
          ...(options.sslHostAddress !== null && { servername: options.sslHostAddress }),
          rejectUnauthorized: options.verifyPeer,
        })
      : net.connect({ host: options.host, port: options.port });
    socket.once("error", reject);
    socket.once(options.useSsl ? "secureConnect" : "connect", () => {
      socket.removeListener("error", reject);
      const conn: HttpClientConnection = {
        writeTimeout: options.writeTimeout,
        debugOutput: options.debugOutput,
        sslVersion: socket.getProtocol?.() ?? null,
        cipher: socket.getCipher !== undefined ? [socket.getCipher().name] : null,
        request: (method, path, headers, body) =>
          new Promise((resolveResponse, rejectResponse) => {
            const out = conn.debugOutput;
            if (out != null) {
              let buf = `${method} ${path} HTTP/1.1\r\n`;
              for (const [k, vs] of Object.entries(headers)) {
                const name = k.replace(
                  /[^-]+/g,
                  (w) => w[0].toUpperCase() + w.slice(1).toLowerCase(),
                );
                for (const v of vs) buf += `${name}: ${v}\r\n`;
              }
              buf += "\r\n";
              out.write(`<- ${rbStrDump(buf)}\n`);
              if (body != null && body.length > 0) {
                const text = typeof body === "string" ? body : new TextDecoder().decode(body);
                out.write(`<- ${rbStrDump(text)}\n`);
              }
            }
            let timer: ReturnType<typeof setTimeout> | null = null;
            const req = http.request(
              { method, path, headers, createConnection: () => socket },
              (res) => {
                if (timer !== null) clearTimeout(timer);
                const chunks: Uint8Array[] = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("error", rejectResponse);
                res.on("end", () => {
                  const total = chunks.reduce((n, c) => n + c.length, 0);
                  const bytes = new Uint8Array(total);
                  let offset = 0;
                  for (const c of chunks) {
                    bytes.set(c, offset);
                    offset += c.length;
                  }
                  const out = conn.debugOutput;
                  if (out != null) {
                    const line = (l: string) => out.write(`-> ${rbStrDump(`${l}\r\n`)}\n`);
                    line(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage ?? ""}`);
                    for (let i = 0; i < res.rawHeaders.length; i += 2) {
                      line(`${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}`);
                    }
                    line("");
                    out.write(`reading ${total} bytes...\n`);
                    out.write(`-> ${rbStrDump(new TextDecoder().decode(bytes))}\n`);
                    out.write(`read ${total} bytes\n`);
                  }
                  resolveResponse({
                    httpVersion: res.httpVersion,
                    statusCode: res.statusCode!,
                    statusMessage: res.statusMessage ?? "",
                    headers: res.headers,
                    body: bytes,
                  });
                });
              },
            );
            req.on("error", rejectResponse);
            req.end(body);
            if (conn.writeTimeout != null) {
              const sec = conn.writeTimeout;
              const wait = () => {
                if (timer !== null) clearTimeout(timer);
                timer = setTimeout(() => {
                  socket.removeListener("drain", wait);
                  socket.destroy();
                  rejectResponse(new WriteTimeout());
                }, sec * 1000);
              };
              socket.on("drain", wait);
              req.once("finish", () => {
                socket.removeListener("drain", wait);
                if (timer !== null) clearTimeout(timer);
              });
              wait();
            }
          }),
        close: () => socket.destroy(),
        isClosed: () => socket.destroyed,
        isEof: () => socket.readableEnded,
      };
      resolve(conn);
    });
  });
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    const proc = nodeProcess();
    if (proc === undefined || !proc.versions?.node) {
      return false;
    }
    const req = syncBuiltinLoader();
    if (!req) return false;
    const http = req("node:http") as NodeHttp;
    const net = req("node:net") as NodeNet;
    const tls = req("node:tls") as NodeNet;
    registry.set("node", {
      createServer: (handler) => http.createServer(handler),
      connect: (options) => _nodeConnect(net, tls, options, http),
    });
    return true;
  } catch {
    return false;
  }
}

/** @noRailsEquivalent PERMANENT */
export async function getHttpAsync(): Promise<HttpAdapter> {
  if (resolved) return resolved;
  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`HTTP adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }
  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }
  throw new Error(
    "No HTTP adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; otherwise set ActiveSupport.httpAdapter or register a custom adapter.",
  );
}

/** @noRailsEquivalent PERMANENT */
export const httpAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    return currentAdapterName;
  },
  /** @noRailsEquivalent PERMANENT */
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
