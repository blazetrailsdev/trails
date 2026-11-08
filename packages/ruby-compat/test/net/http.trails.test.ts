import { createServer, type Server } from "node:http";
import { createServer as createNetServer, type Socket as NetSocket } from "node:net";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { SystemCallError } from "../../lib/errno.js";
import { OpenSSL } from "../../lib/openssl.js";
import { SocketError } from "../../lib/socket.js";
import { URI } from "../../lib/uri.js";
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
