import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { gzipSync } from "node:zlib";

export async function withRawBackend(
  handler: (client: Socket) => unknown,
  block: (backend: string) => Promise<void>,
): Promise<void> {
  const server = createTcpServer((client) => {
    let head = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf("\r\n\r\n");
      if (end === -1) return;
      client.off("data", onData);
      client.pause();
      client.unshift(head.subarray(end + 4));
      client.on("error", () => {});
      handler(client);
    };
    client.on("data", onData);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await block(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  } finally {
    server.close();
  }
}

export const GZIP_PLAINTEXT = "the quick brown fox ".repeat(32);

export function gzip(string: string): Uint8Array {
  return gzipSync(string);
}

type Proc = (req: IncomingMessage, res: ServerResponse) => void;

function mountRoutes(server: Server, procs: Map<string, Proc>): void {
  server.on("request", (req, res) => {
    const proc = procs.get(req.url ?? "");
    if (proc !== undefined) return proc(req, res);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    switch (url.pathname) {
      case "/cookies/set":
        res.setHeader("Set-Cookie", `test=${url.searchParams.get("test") ?? "1"}`);
        res.end("cookie set");
        return;
      case "/echo-headers":
        res.setHeader("x-custom", "value-here");
        res.end("ok");
        return;
      case "/echo-request-headers":
        res.setHeader("Content-Type", "text/plain");
        res.end(
          ["cookie", "authorization", "x-forwarded-for"]
            .filter((name) => req.headers[name] != null)
            .map((name) => `${name}: ${req.headers[name]}`)
            .join("\n"),
        );
        return;
      case "/chunked":
        res.setHeader("Content-Type", "text/plain");
        res.write("chunk-one ");
        res.end("chunk-two");
        return;
      case "/echo-body": {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => res.end(Buffer.concat(chunks)));
        return;
      }
      case "/no-content":
        res.statusCode = 204;
        res.end();
        return;
      case "/not-modified":
        res.statusCode = 304;
        res.end();
        return;
      case "/empty":
        res.end("");
        return;
      case "/gzip": {
        const body = gzip(GZIP_PLAINTEXT);
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Content-Encoding": "gzip",
          "Content-Length": body.length,
        });
        res.end(body);
        return;
      }
      default: {
        const body =
          "<!doctype html><html><head><title>Example Domain</title></head>" +
          "<body><h1>Example Domain</h1><p>Local rack-proxy test fixture.</p></body></html>";
        res.writeHead(200, {
          "Content-Type": "text/html; charset=UTF-8",
          "Content-Length": new TextEncoder().encode(body).length,
        });
        res.end(body);
      }
    }
  });
}

export interface TestServer {
  port: number;
  mountProc(path: string, proc: Proc): void;
  shutdown(): Promise<void>;
}

export async function startServer(): Promise<[TestServer, number]> {
  const server = createServer();
  const procs = new Map<string, Proc>();
  mountRoutes(server, procs);
  const sockets = new Set<Socket>();
  server.on("connection", (s: Socket) => sockets.add(s));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const shutdown = () =>
    new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    });
  return [{ port, mountProc: (path, proc) => procs.set(path, proc), shutdown }, port];
}
