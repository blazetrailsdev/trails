import { IOError } from "./io-error.js";

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

/**
 * The socket `Net::BufferedIO` reads and writes (`vendor/ruby/v3.3.11/lib/net/protocol.rb:116-125`):
 * a `TCPSocket`, which `start_ssl` turns into an `OpenSSL::SSL::SSLSocket`
 * (`vendor/ruby/v3.3.11/lib/net/http.rb:1666-1676`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface HttpClientSocket {
  readNonblock(): Uint8Array | "wait_readable" | "wait_writable" | null;
  waitReadable(timeout: number | null): Promise<boolean>;
  writeNonblock(str: Uint8Array): boolean;
  waitWritable(timeout: number | null): Promise<boolean>;
  startSsl(options: HttpSslOptions): Promise<void>;
  close(): void;
  isClosed(): boolean;
  isEof(): boolean;
  inspect(): string;
  peeraddr(): [string, number, string, string];
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
}

/** @noRailsEquivalent PERMANENT */
export interface HttpSslOptions {
  sslHostAddress: string | null;
  verifyPeer: boolean;
}

export interface HttpAdapter {
  createServer(handler: (req: HttpRequest, res: HttpResponse) => void): HttpServer;
  connect?(options: HttpConnectOptions): Promise<HttpClientSocket>;
  getaddress?(host: string): Promise<string>;
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
  on(event: string, listener: (arg?: never) => void): unknown;
  removeListener(event: string, listener: (arg?: never) => void): unknown;
  write(chunk: Uint8Array): boolean;
  destroy(): unknown;
  readonly destroyed: boolean;
  readonly remoteAddress?: string | undefined;
  readonly remotePort?: number | undefined;
  readonly remoteFamily?: string | undefined;
  getProtocol?(): string | null;
  getCipher?(): { name: string };
};

type NodeHttp = {
  createServer: (handler: (req: HttpRequest, res: HttpResponse) => void) => HttpServer;
};

type NodeNet = { connect(options: Record<string, unknown>): NodeSocket };
type NodeDns = { promises: { lookup(host: string): Promise<{ address: string }> } };

function _nodeWait(
  sock: NodeSocket,
  events: string[],
  ready: () => boolean,
  timeout: number | null,
): Promise<boolean> {
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (v: boolean) => {
      clearTimeout(timer);
      for (const e of events) sock.removeListener(e, wake);
      resolve(v);
    };
    const wake = () => done(true);
    for (const e of events) sock.on(e, wake);
    if (timeout != null) timer = setTimeout(() => done(false), timeout * 1000);
  });
}

/** @noRailsEquivalent PERMANENT */
class _NodeClientSocket implements HttpClientSocket {
  private readonly rbuf: Uint8Array[] = [];
  private eof = false;
  private error: Error | null = null;
  private writable = true;
  private ssl = false;
  private closed = false;
  private readonly onData = (chunk: Uint8Array) => void this.rbuf.push(chunk);
  private readonly onEnd = () => void (this.eof = true);
  private readonly onError = (e: Error) => void (this.error = e);
  private readonly onDrain = () => void (this.writable = true);

  constructor(
    private io: NodeSocket,
    private readonly tls: NodeNet,
  ) {
    this.bind("on");
  }

  private bind(on: "on" | "removeListener"): void {
    this.io[on]("data", this.onData as never);
    this.io[on]("end", this.onEnd);
    this.io[on]("error", this.onError as never);
    this.io[on]("drain", this.onDrain);
  }

  readNonblock(): Uint8Array | "wait_readable" | "wait_writable" | null {
    if (this.error !== null) throw this.error;
    if (this.rbuf.length > 0) return this.rbuf.shift()!;
    return this.eof ? null : "wait_readable";
  }

  waitReadable(timeout: number | null): Promise<boolean> {
    const ready = () => this.rbuf.length > 0 || this.eof || this.error !== null;
    return _nodeWait(this.io, ["data", "end", "error", "close"], ready, timeout);
  }

  writeNonblock(str: Uint8Array): boolean {
    if (this.error !== null) throw this.error;
    return (this.writable = this.io.write(str));
  }

  waitWritable(timeout: number | null): Promise<boolean> {
    return _nodeWait(this.io, ["drain", "error", "close"], () => this.writable, timeout);
  }

  startSsl(options: HttpSslOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.bind("removeListener");
      this.io = this.tls.connect({
        socket: this.io,
        ...(options.sslHostAddress !== null && { servername: options.sslHostAddress }),
        rejectUnauthorized: options.verifyPeer,
      });
      this.ssl = true;
      this.bind("on");
      this.io.once("error", reject);
      this.io.once("secureConnect", () => {
        this.io.removeListener("error", reject as never);
        resolve();
      });
    });
  }

  close(): void {
    this.closed = true;
    this.io.destroy();
  }

  isClosed(): boolean {
    return this.closed;
  }

  isEof(): boolean {
    return this.eof && this.rbuf.length === 0;
  }

  peeraddr(): [string, number, string, string] {
    if (this.io.destroyed) throw new IOError("closed stream");
    const addr = this.io.remoteAddress!;
    const family = this.io.remoteFamily === "IPv6" ? "AF_INET6" : "AF_INET";
    return [family, this.io.remotePort!, addr, addr];
  }

  inspect(): string {
    const name = this.ssl ? "OpenSSL::SSL::SSLSocket" : "TCPSocket";
    return `#<${name}${this.io.destroyed ? ":(closed)" : ""}>`;
  }

  get sslVersion(): string | null {
    return this.io.getProtocol?.() ?? null;
  }

  get cipher(): string[] | null {
    return this.io.getCipher !== undefined ? [this.io.getCipher().name] : null;
  }
}

function _nodeConnect(net: NodeNet, tls: NodeNet, options: HttpConnectOptions) {
  return new Promise<HttpClientSocket>((resolve, reject) => {
    const io = net.connect({ host: options.host, port: options.port, noDelay: true });
    io.once("error", reject);
    io.once("connect", () => {
      io.removeListener("error", reject as never);
      resolve(new _NodeClientSocket(io, tls));
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
    const dns = req("node:dns") as NodeDns;
    registry.set("node", {
      createServer: (handler) => http.createServer(handler),
      connect: (options) => _nodeConnect(net, tls, options),
      getaddress: async (host) => (await dns.promises.lookup(host)).address,
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
