import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { gzipSync } from "node:zlib";

export const GZIP_PLAINTEXT = "the quick brown fox ".repeat(32);

export function gzip(string: string): Uint8Array {
  return gzipSync(string);
}

type Proc = (req: IncomingMessage, res: ServerResponse) => void;

function mountRoutes(server: Server, procs: Map<string, Proc>): void {
  server.on("request", (req, res) => {
    const proc = procs.get(req.url ?? "");
    if (proc !== undefined) return proc(req, res);
    switch (req.url) {
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
