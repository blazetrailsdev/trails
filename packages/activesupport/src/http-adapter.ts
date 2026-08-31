/**
 * HTTP adapter — mirrors the Rails adapter pattern.
 *
 * Exposes the one runtime surface a Rack handler needs — `createServer` — so
 * `@blazetrails/rack` can serve HTTP without importing `node:http`, the same
 * way {@link getFsAsync} and {@link getChildProcessAsync} keep `node:fs` and
 * `node:child_process` out of the packages that use them.
 */

/** The structural subset of Node's `IncomingMessage` a Rack handler reads. */
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

/** The structural subset of Node's `ServerResponse` a Rack handler writes. */
export interface HttpResponse {
  writeHead(status: number, headers?: Record<string, string | string[]>): unknown;
  write(chunk: string | Uint8Array): unknown;
  end(chunk?: string | Uint8Array): unknown;
}

/** A listening server, the structural subset of Node's `http.Server`. */
export interface HttpServer {
  listen(port: number, host: string, listener?: () => void): unknown;
  close(callback?: (error?: Error) => void): unknown;
  address(): string | { port: number } | null;
}

export interface HttpAdapter {
  createServer(handler: (req: HttpRequest, res: HttpResponse) => void): HttpServer;
}

const registry = new Map<string, HttpAdapter>();
let currentAdapterName: string | null = null;
let resolved: HttpAdapter | null = null;

export function registerHttpAdapter(name: string, adapter: HttpAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAsyncPromise: Promise<boolean> | null = null;

type NodeHttp = {
  createServer: (handler: (req: HttpRequest, res: HttpResponse) => void) => HttpServer;
};

function tryAutoRegisterNodeAsync(): Promise<boolean> {
  if (registry.has("node")) return Promise.resolve(true);
  if (!nodeAsyncPromise) {
    nodeAsyncPromise = (async () => {
      try {
        if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
          return false;
        }
        const http = (await import("node:http")) as unknown as NodeHttp;
        registry.set("node", { createServer: (handler) => http.createServer(handler) });
        return true;
      } catch {
        return false;
      }
    })();
  }
  return nodeAsyncPromise;
}

export async function getHttpAsync(): Promise<HttpAdapter> {
  if (resolved) return resolved;
  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    // Ruby's counterpart is the core `NameError` `Rackup::Handler.get` raises
    // for a handler constant that never registered itself; there is no Rails
    // error class to port here.
    // eslint-disable-next-line blazetrails/rails-error-parity
    if (!reg) throw new Error(`HTTP adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }
  if (await tryAutoRegisterNodeAsync()) {
    resolved = registry.get("node")!;
    return resolved;
  }
  // Ruby's counterpart is the core `LoadError` `Rackup::Handler.get` raises
  // when no server library can be required — the same stand-in `yaml.ts:16`
  // documents.
  // eslint-disable-next-line blazetrails/rails-error-parity
  throw new Error(
    "No HTTP adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; otherwise set ActiveSupport.httpAdapter or register a custom adapter.",
  );
}

export const httpAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
