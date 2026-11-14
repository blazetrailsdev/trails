import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { gzipSync } from "node:zlib";

export const GZIP_PLAINTEXT = "the quick brown fox ".repeat(32);

export function gzip(string: string): Uint8Array {
  return gzipSync(string);
}

function mountRoutes(server: Server): void {
  server.on("request", (req, res) => {
    switch (req.url) {
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
  shutdown(): Promise<void>;
}

export async function startServer(): Promise<[TestServer, number]> {
  const server = createServer();
  mountRoutes(server);
  const sockets = new Set<Socket>();
  server.on("connection", (s: Socket) => sockets.add(s));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const shutdown = () =>
    new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    });
  return [{ port, shutdown }, port];
}
