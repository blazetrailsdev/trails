import { createServer, type Server } from "node:http";
import { createServer as createNetServer, type Socket as NetSocket } from "node:net";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { SystemCallError } from "../../lib/errno.js";
import { OpenSSL } from "../../lib/openssl.js";
import { SocketError } from "../../lib/socket.js";
import { HTTPS, URI } from "../../lib/uri.js";
import { Net } from "../../lib/net/protocol.js";
import "../../lib/net/http.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function listen(server: Server | ReturnType<typeof createNetServer>): Promise<number> {
  const sockets = new Set<NetSocket>();
  server.on("connection", (s: NetSocket) => sockets.add(s));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(
    () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  );
  return (server.address() as { port: number }).port;
}

describe("Net::HTTP", () => {
  it("posts and answers the CODE_TO_OBJ class for the status", async () => {
    let seen: { method?: string; url?: string; body: string; type?: string } = { body: "" };
    const port = await listen(
      createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          seen = { method: req.method, url: req.url, body, type: req.headers["content-type"] };
          res.writeHead(req.url === "/denied" ? 401 : 204);
          res.end();
        });
      }),
    );
    const uri = URI.parse(`http://127.0.0.1:${port}/inbound?x=1`);
    const client = new Net.HTTP("127.0.0.1", port);
    client.openTimeout = 1;
    client.readTimeout = 10;
    const response = await client.post(uri as never, "From: a@b", {
      "Content-Type": "message/rfc822",
    });
    expect(response).toBeInstanceOf(Net.HTTPSuccess);
    expect(response.code).toBe("204");
    expect(seen).toEqual({
      method: "POST",
      url: "/inbound?x=1",
      body: "From: a@b",
      type: "message/rfc822",
    });

    const denied = await new Net.HTTP("127.0.0.1", port).post("/denied", "");
    expect(denied).toBeInstanceOf(Net.HTTPUnauthorized);
    expect(denied).not.toBeInstanceOf(Net.HTTPSuccess);
  });

  it("decodes a gzip response body and sets the response uri", async () => {
    let acceptEncoding: string | undefined;
    const port = await listen(
      createServer((req, res) => {
        acceptEncoding = req.headers["accept-encoding"];
        const body = gzipSync("hello");
        res.writeHead(200, { "content-encoding": "gzip", "content-length": body.length });
        res.end(body);
      }),
    );
    const uri = URI.parse(`http://127.0.0.1:${port}/x`);
    const response = await new Net.HTTP("127.0.0.1", port).post(uri as never, "");
    expect(acceptEncoding).toBe("gzip;q=1.0,deflate;q=0.6,identity;q=0.3");
    expect(response).toBeInstanceOf(Net.HTTPOK);
    expect(new TextDecoder().decode(response.body!)).toBe("hello");
    expect(response.get("content-encoding")).toBeNull();
    expect(response.get("content-length")).toBe("5");
    expect(response.uri!.toString()).toBe(`http://127.0.0.1:${port}/x`);
    expect(response.uri).not.toBe(uri);
  });

  it("reads past a 1xx response to the final one", async () => {
    const port = await listen(
      createServer((_req, res) => {
        res.writeEarlyHints({ link: "</a.css>; rel=preload" });
        res.writeHead(201);
        res.end("made");
      }),
    );
    const response = await new Net.HTTP("127.0.0.1", port).post("/", "");
    expect(response).toBeInstanceOf(Net.HTTPCreated);
  });

  it("closes a keep-alive connection when the response says close", async () => {
    const port = await listen(
      createServer((_req, res) => {
        res.writeHead(200, { connection: "close" });
        res.end("x");
      }),
    );
    const http = new Net.HTTP("127.0.0.1", port);
    await http.start();
    const response = await http.post("/", "");
    expect(response.isConnectionClose()).toBe(true);
    expect(http.isKeepAlive(new Net.HTTP.Post("/"), response)).toBe(false);
    http.doFinish();
  });

  it("sends accept-encoding and decodes only when the caller set neither it nor range", () => {
    const req = new Net.HTTP.Post("/");
    expect(req.get("accept-encoding")).toBe("gzip;q=1.0,deflate;q=0.6,identity;q=0.3");
    expect(req.decodeContent).toBe(true);
    const ranged = new Net.HTTP.Post("/", { Range: "bytes=0-1" });
    expect(ranged.get("accept-encoding")).toBeNull();
    expect(ranged.decodeContent).toBe(false);
    expect(new Net.HTTP.Post("/", { "Accept-Encoding": "br" }).decodeContent).toBe(false);
  });

  it("update_uri strips the host port and converts the URI class for ssl", () => {
    const req = new Net.HTTP.Post(URI.parse("http://example.com:8080/p?q=1") as never);
    req.updateUri("example.com", 443, true);
    expect(req.uri).toBeInstanceOf(HTTPS);
    expect(req.uri!.toString()).toBe("https://example.com/p?q=1");
  });

  it("max_retries truncates and rejects a negative count", () => {
    const http = new Net.HTTP("127.0.0.1", 1);
    http.maxRetries = 2.7;
    expect(http.maxRetries).toBe(2);
    expect(() => (http.maxRetries = -1)).toThrow(
      "max_retries should be non-negative integer number",
    );
  });

  it("raises Errno::ECONNREFUSED when nothing listens", async () => {
    const port = await listen(createNetServer());
    await closers.pop()!();
    const error = await new Net.HTTP("127.0.0.1", port).post("/", "").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SystemCallError);
    expect((error as Error).name).toBe("Errno::ECONNREFUSED");
    expect((error as Error).message).toBe(
      `Failed to open TCP connection to 127.0.0.1:${port} (Connection refused - connect(2) for "127.0.0.1" port ${port})`,
    );
  });

  it("raises SocketError when the host does not resolve", async () => {
    const error = await new Net.HTTP("nonexistent.invalid", 80)
      .post("/", "")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SocketError);
  });

  it("raises Net::OpenTimeout when the handshake does not finish within open_timeout", async () => {
    const port = await listen(createNetServer());
    const client = new Net.HTTP("127.0.0.1", port);
    client.useSsl = true;
    client.verifyMode = OpenSSL.SSL.VERIFY_PEER;
    client.openTimeout = 0.1;
    const error = await client.post("/", "").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Net.OpenTimeout);
    expect((error as Error).message).toBe("execution expired");
  });

  it("raises Net::ReadTimeout when no response arrives within read_timeout", async () => {
    const port = await listen(createServer(() => {}));
    const client = new Net.HTTP("127.0.0.1", port);
    client.readTimeout = 0.1;
    const error = await client.post("/", "").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Net.ReadTimeout);
    expect((error as Error).message).toBe("Net::ReadTimeout");
  });
});
