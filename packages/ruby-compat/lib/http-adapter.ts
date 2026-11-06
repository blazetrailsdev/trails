export interface HttpRequest {
  method?: string | undefined;
  url?: string | undefined;
  httpVersion?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string | undefined; encrypted?: boolean | undefined };
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "end" | "error", listener: (error: Error) => void): unknown;
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
}

/** @noRailsEquivalent PERMANENT */
export interface HttpConnectOptions {
  host: string;
  port: number;
  useSsl: boolean;
  sslHostAddress: string | null;
  verifyPeer: boolean;
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
};

type NodeIncoming = {
  httpVersion: string;
  statusCode?: number;
  statusMessage?: string;
  headers: Record<string, string | string[] | undefined>;
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
      resolve({
        request: (method, path, headers, body) =>
          new Promise((resolveResponse, rejectResponse) => {
            const req = http.request(
              { method, path, headers, createConnection: () => socket },
              (res) => {
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
          }),
        close: () => socket.destroy(),
      });
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
