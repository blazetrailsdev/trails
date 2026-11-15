import { createServer, type Server } from "node:http";
import { createServer as createNetServer, type Socket as NetSocket } from "node:net";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { Errno, SystemCallError } from "../../lib/errno.js";
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
    expect(new TextDecoder().decode(response.body as Uint8Array)).toBe("hello");
    expect(response.get("content-encoding")).toBeNull();
    expect(response.get("content-length")).toBe("5");
    expect(response.uri!.toString()).toBe(`http://127.0.0.1:${port}/x`);
    expect(response.uri).not.toBe(uri);
  });

  it("get yields the body segment to its block", async () => {
    const port = await listen(createServer((_req, res) => res.end("hello")));
    const segments: string[] = [];
    const response = await new Net.HTTP("127.0.0.1", port).get("/", null, null, (segment) => {
      segments.push(new TextDecoder().decode(segment));
    });
    expect(segments).toEqual(["hello"]);
    expect(response.code).toBe("200");
  });

  it("post yields the body segment to its block", async () => {
    const port = await listen(createServer((_req, res) => res.end("posted")));
    const segments: string[] = [];
    await new Net.HTTP("127.0.0.1", port).post("/", "x", null, null, (segment) => {
      segments.push(new TextDecoder().decode(segment));
    });
    expect(segments).toEqual(["posted"]);
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

  it("reconnects when the server closed an idle keep-alive connection", async () => {
    const server = createServer((_req, res) => res.end("ok"));
    server.keepAliveTimeout = 20;
    const port = await listen(server);
    const http = new Net.HTTP("127.0.0.1", port);
    await http.start();
    expect((await http.post("/", "")).code).toBe("200");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await http.post("/", "")).code).toBe("200");
    http.doFinish();
  });

  it("connection_close? reads the request's connection header", () => {
    expect(new Net.HTTP.Post("/", { Connection: "keep-alive, close" }).isConnectionClose()).toBe(
      true,
    );
    expect(new Net.HTTP.Post("/").isConnectionClose()).toBe(false);
  });

  it("raises Errno::ETIMEDOUT and Errno::ECONNABORTED with their strerror", () => {
    expect(new Errno.ETIMEDOUT("x").message).toBe("Connection timed out - x");
    expect(new Errno.ECONNABORTED().message).toBe("Software caused connection abort");
    expect(Object.assign(new Error(), { code: "ETIMEDOUT" })).toBeInstanceOf(Errno.ETIMEDOUT);
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
    expect((error as Error).message).toBe("Net::ReadTimeout with #<TCPSocket>");
  });
  it("retries an idempotent GET once on a dropped connection and not a POST", async () => {
    let connections = 0;
    const port = await listen(
      createNetServer((socket) => {
        connections += 1;
        socket.once("data", () => {
          if (connections === 1 || connections === 3) socket.destroy();
          else socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
        });
      }),
    );
    const response = await new Net.HTTP("127.0.0.1", port).get("/");
    expect(connections).toBe(2);
    expect(response.code).toBe("200");
    expect(new TextDecoder().decode(response.body as Uint8Array)).toBe("ok");

    const error = await new Net.HTTP("127.0.0.1", port).post("/", "").catch((e: unknown) => e);
    expect(connections).toBe(3);
    expect(error).toBeInstanceOf(Error);
  });

  it("head answers a response without a body", async () => {
    const port = await listen(createServer((_req, res) => res.end("ignored")));
    const response = await new Net.HTTP("127.0.0.1", port).head("/");
    expect(response.code).toBe("200");
    expect(response.body).toBeNull();
  });
});

describe("Net::HTTP surface rack-proxy reaches", () => {
  it("resolves every request class by Net::HTTP const name", () => {
    const H = Net.HTTP as unknown as Record<string, { METHOD: string }>;
    for (const m of ["Get", "Head", "Post", "Put", "Delete", "Options", "Trace", "Patch"]) {
      expect(H[m].METHOD).toBe(m.toUpperCase());
    }
  });

  it("initialize_http_header downcases keys, strips values and rejects CR/LF", () => {
    const req = new Net.HTTP.Get("/", { "X-Foo": " bar ", "X-Nil": null });
    expect(req.get("x-foo")).toBe("bar");
    expect(req.get("x-nil")).toBeNull();
    expect(req.isKey("X-FOO")).toBe(true);
    expect(() => new Net.HTTP.Get("/", { "X-Bad": "a\nb" })).toThrow(
      'header X-Bad has field value "a\\nb", this cannot include CR/LF',
    );
  });

  it("basic_auth, content_length= and content_type= write their headers", () => {
    const req = new Net.HTTP.Post("/");
    req.basicAuth("my_account", "my_password");
    expect(req.get("Authorization")).toBe("Basic bXlfYWNjb3VudDpteV9wYXNzd29yZA==");
    req.contentLength = "12";
    expect(req.contentLength).toBe(12);
    req.contentLength = 1e21;
    expect(req.get("content-length")).toBe("1000000000000000000000");
    req.contentLength = null;
    expect(req.get("content-length")).toBeNull();
    req.contentType = "text/plain";
    expect(req.contentType).toBe("text/plain");
    req.set("Content-Length", "x");
    expect(() => req.contentLength).toThrow(Net.HTTPHeaderSyntaxError);
    req.setContentType("text/html", { charset: "utf-8" });
    expect(req.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("request_body_permitted?, response_body_permitted? and body_stream=", () => {
    expect(new Net.HTTP.Post("/").isRequestBodyPermitted()).toBe(true);
    expect(new Net.HTTP.Get("/").isRequestBodyPermitted()).toBe(false);
    expect(new Net.HTTP.Head("/").isResponseBodyPermitted()).toBe(false);
    const req = new Net.HTTP.Put("/");
    req.body = "x";
    const io = { read: () => null };
    expect(req.setBodyStream(io)).toBe(io);
    expect(req.body).toBeNull();
    expect(req.bodyStream).toBe(io);
    expect(() => req.setBodyInternal("y")).toThrow(
      "both of body argument and HTTPRequest#body set",
    );
  });

  it("HTTP's SSL and timeout accessors and set_debug_output", () => {
    const http = new Net.HTTP("example.com", 443);
    expect(http.writeTimeout).toBe(60);
    http.openTimeout = 5;
    http.writeTimeout = 7;
    http.verifyMode = OpenSSL.SSL.VERIFY_NONE;
    http.caFile = "/ca.pem";
    http.certStore = {};
    http.minVersion = "TLS1_2";
    http.maxVersion = "TLS1_3";
    http.sslVersion = "TLSv1_2";
    http.cert = "cert";
    http.key = "key";
    http.setDebugOutput(null);
    expect([http.openTimeout, http.writeTimeout, http.caFile, http.minVersion]).toEqual([
      5,
      7,
      "/ca.pem",
      "TLS1_2",
    ]);
  });

  it("read_body yields the body to a block and to_hash answers the header lists", async () => {
    const port = await listen(
      createServer((_req, res) => {
        res.writeHead(200, { "X-A": "1" });
        res.end("hello");
      }),
    );
    const http = new Net.HTTP("127.0.0.1", port);
    const chunks: string[] = [];
    await http.start(async (h) => {
      await h.request(
        new Net.HTTP.Get("/"),
        null,
        async (res: InstanceType<typeof Net.HTTPResponse>) => {
          expect(res.toHash()["x-a"]).toEqual(["1"]);
          await expect(res.readBody({ append: () => {} }, () => {})).rejects.toThrow(
            "both arg and block given for HTTP method",
          );
          await res.readBody(null, (c: Uint8Array) => chunks.push(new TextDecoder().decode(c)));
        },
      );
    });
    expect(chunks).toEqual(["hello"]);
  });

  it("content_length= reads a String the way String#to_i does", () => {
    const req = new Net.HTTP.Get("/");
    req.contentLength = "1_000";
    expect(req.get("content-length")).toBe("1000");
  });

  it("set_debug_output receives the connection and wire traffic", async () => {
    const port = await listen(
      createServer((_req, res) => {
        res.writeHead(200, { "Content-Length": "2" });
        res.end("hi");
      }),
    );
    let out = "";
    const http = new Net.HTTP("127.0.0.1", port);
    http.setDebugOutput({ write: (s: string) => (out += s) });
    await http.get("/x");
    expect(out).toContain(`opening connection to 127.0.0.1:${port}...\nopened\n`);
    expect(out).toMatch(/<- "GET \/x HTTP\/1\.1\\r\\n.*Connection: close\\r\\n/);
    expect(out).toContain('-> "HTTP/1.1 200 OK\\r\\n"\n');
    expect(out).toContain('-> "Content-Length: 2\\r\\n"\n');
    expect(out).toContain('reading 2 bytes...\n-> "hi"\nread 2 bytes\n');
    expect(out).toContain("Conn close\n");
  });

  it("write_timeout= reaches the open socket and raises Net::WriteTimeout", async () => {
    const server = createNetServer((s) => s.pause());
    const port = await listen(server);
    const http = new Net.HTTP("127.0.0.1", port);
    await http.start();
    http.writeTimeout = 0.2;
    expect((http as unknown as { _socket: { writeTimeout: number } })._socket.writeTimeout).toBe(
      0.2,
    );
    await expect(http.post("/", "x".repeat(64 * 1024 * 1024))).rejects.toThrow(Net.WriteTimeout);
  });

  it("read_body streams each chunk through a ReadAdapter as it arrives", async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const port = await listen(
      createServer(async (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("first");
        await released;
        res.end("second");
      }),
    );
    const http = new Net.HTTP("127.0.0.1", port);
    const chunks: string[] = [];
    await http.start(async (h) => {
      await h.request(
        new Net.HTTP.Get("/"),
        null,
        async (res: InstanceType<typeof Net.HTTPResponse>) => {
          await res.readBody(null, (c: Uint8Array) => {
            chunks.push(new TextDecoder().decode(c));
            release();
          });
          expect(res.body).toBeInstanceOf(Net.ReadAdapter);
        },
      );
    });
    expect(chunks).toEqual(["first", "second"]);
  });
});

describe("Net::HTTP over Net::BufferedIO", () => {
  it("opens TCP before SSL and closes the socket on a failed handshake", async () => {
    let closed = false;
    const port = await listen(
      createNetServer((s) => {
        s.on("close", () => (closed = true));
        s.once("data", () => s.write("HTTP/1.1 400 Bad Request\r\n\r\n"));
      }),
    );
    let out = "";
    const client = new Net.HTTP("127.0.0.1", port);
    client.useSsl = true;
    client.setDebugOutput({ write: (s: string) => (out += s) });
    const error = await client.post("/", "").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OpenSSL.SSL.SSLError);
    expect(out).toBe(
      `opening connection to 127.0.0.1:${port}...\nopened\n` +
        `starting SSL for 127.0.0.1:${port}...\n` +
        `Conn close because of connect error ${(error as Error).message}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toBe(true);
  });

  it("debug_output shows the bytes the server received and sent", async () => {
    const sent = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nX-A: 1\r\n\r\nok";
    let received = "";
    const port = await listen(
      createNetServer((s) => {
        s.on("data", (c) => {
          received += c.toString("latin1");
          if (received.endsWith("body")) s.end(sent);
        });
      }),
    );
    let out = "";
    const http = new Net.HTTP("127.0.0.1", port);
    http.setDebugOutput({ write: (s: string) => (out += s) });
    const res = await http.post("/p", "body", { "Content-Type": "text/plain" });
    expect(res.code).toBe("200");
    const writes = [...out.matchAll(/^<- (.*)$/gm)].map((m) => JSON.parse(m[1]) as string);
    expect(writes.join("")).toBe(received);
    const reads = [...out.matchAll(/^-> (.*)$/gm)].map((m) => JSON.parse(m[1]) as string);
    expect(reads.join("")).toBe(sent);
    expect(reads.slice(0, 3)).toEqual([
      "HTTP/1.1 200 OK\r\n",
      "Content-Length: 2\r\n",
      "X-A: 1\r\n",
    ]);
  });

  it("reads a chunked response body", async () => {
    const port = await listen(
      createNetServer((s) =>
        s.once("data", () =>
          s.end(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n1\r\n!\r\n0\r\n\r\n",
          ),
        ),
      ),
    );
    const res = await new Net.HTTP("127.0.0.1", port).get("/");
    expect(new TextDecoder().decode(res.body as Uint8Array)).toBe("ok!");
  });

  it("reads a header line split across socket reads", async () => {
    const port = await listen(
      createNetServer((s) =>
        s.once("data", () => {
          s.write("HTTP/1.1 200 OK\r\nX-A: 1");
          setTimeout(() => s.end("\r\nContent-Length: 2\r\n\r\nok"), 20);
        }),
      ),
    );
    const res = await new Net.HTTP("127.0.0.1", port).get("/");
    expect([res.get("x-a"), new TextDecoder().decode(res.body as Uint8Array)]).toEqual(["1", "ok"]);
  });

  it("raises Net::HTTPBadResponse for a wrong status line", async () => {
    const port = await listen(createNetServer((s) => s.once("data", () => s.end("nope\r\n\r\n"))));
    const http = new Net.HTTP("127.0.0.1", port);
    http.maxRetries = 0;
    await expect(http.get("/")).rejects.toThrow(Net.HTTPBadResponse);
  });

  function rawServer(until: (received: string) => boolean, reply: string) {
    const seen = { received: "" };
    const server = createNetServer((s) => {
      s.on("data", (c) => {
        seen.received += c.toString("latin1");
        if (until(seen.received)) s.end(reply);
      });
    });
    return { seen, server };
  }

  function source(...pieces: string[]) {
    return { read: () => pieces.shift() ?? null };
  }

  it("send_request_with_body_stream copies the stream after the header", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("hello world"),
      "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
    );
    const port = await listen(server);
    const req = new Net.HTTP.Post("/p", { "Content-Type": "text/plain", "Content-Length": "11" });
    req.setBodyStream(source("hello ", "world"));
    const res = await new Net.HTTP("127.0.0.1", port).request(req);
    expect(res.code).toBe("200");
    expect(seen.received.startsWith("POST /p HTTP/1.1\r\n")).toBe(true);
    expect(seen.received).toContain("Content-Length: 11\r\n");
    expect(seen.received.endsWith("\r\n\r\nhello world")).toBe(true);
  });

  it("send_request_with_body_stream writes each read through Chunker when chunked", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("0\r\n\r\n"),
      "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
    );
    const port = await listen(server);
    const req = new Net.HTTP.Post("/p", {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked",
    });
    expect(req.isChunked()).toBe(true);
    req.setBodyStream(source("hello ", "world"));
    await new Net.HTTP("127.0.0.1", port).request(req);
    expect(seen.received.endsWith("\r\n\r\n6\r\nhello \r\n5\r\nworld\r\n0\r\n\r\n")).toBe(true);
  });

  it("send_request_with_body_stream raises without Content-Length or chunked", async () => {
    const { server } = rawServer(() => false, "");
    const port = await listen(server);
    const req = new Net.HTTP.Post("/p");
    req.setBodyStream(source("x"));
    await expect(new Net.HTTP("127.0.0.1", port).request(req)).rejects.toThrow(
      "Content-Length not given and Transfer-Encoding is not `chunked'",
    );
  });

  it("edit_path sends an absolute URI through a proxy", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("\r\n\r\n"),
      "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
    );
    const port = await listen(server);
    const http = new Net.HTTP("127.0.0.1", port, null);
    expect(await http.isProxy()).toBe(false);
    http.setProxyAddress("127.0.0.1");
    http.setProxyPort(port);
    expect(await http.isProxy()).toBe(true);
    await http.get("/x");
    expect(seen.received.startsWith(`GET http://127.0.0.1:${port}/x HTTP/1.1\r\n`)).toBe(true);
  });

  it("connect opens to the proxy address, not the target", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("\r\n\r\n"),
      "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
    );
    const port = await listen(server);
    const http = new Net.HTTP("backend.invalid", 8080, "127.0.0.1", port);
    expect(await http.proxyAddress()).toBe("127.0.0.1");
    const res = await http.get("/x");
    expect(res.code).toBe("200");
    expect(seen.received.startsWith("GET http://backend.invalid:8080/x HTTP/1.1\r\n")).toBe(true);
  });

  it("connect sends CONNECT with Proxy-Authorization for use_ssl and raises on a refusal", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("\r\n\r\n"),
      "HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n",
    );
    const port = await listen(server);
    const klass = Net.HTTP.Proxy("127.0.0.1", port, "us er", "pa:ss");
    expect(klass.isProxyClass()).toBe(true);
    expect(Net.HTTP.isProxyClass()).toBe(false);
    const http = new klass("backend.invalid", 443);
    http.useSsl = true;
    expect(await http.proxyUser()).toBe("us er");
    const error = await http.start().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Net.HTTPClientException);
    expect((error as InstanceType<typeof Net.HTTPClientException>).message).toBe(
      '407 "Proxy Authentication Required"',
    );
    expect(seen.received).toBe(
      "CONNECT backend.invalid:443 HTTP/1.1\r\nHost: backend.invalid:443\r\n" +
        `Proxy-Authorization: Basic ${btoa("us er:pa:ss")}\r\n\r\n`,
    );
  });

  it("find_proxy reads *_proxy and honours no_proxy and loopback", async () => {
    const uri = URI.parse("http://10.0.0.1/");
    const env = { http_proxy: "http://proxy.example:3128" };
    expect(String(await uri.findProxy(env))).toBe("http://proxy.example:3128");
    expect(await uri.findProxy({})).toBeNull();
    expect(await uri.findProxy({ ...env, no_proxy: "10.0.0.0/8" })).toBeNull();
    expect(await uri.findProxy({ ...env, NO_PROXY: "other.example, 10.0.0.1" })).toBeNull();
    expect(await URI.parse("http://127.0.0.1/").findProxy(env)).toBeNull();
    expect(
      String(await URI.parse("https://10.0.0.1/").findProxy({ HTTPS_PROXY: "http://s:1" })),
    ).toBe("http://s:1");
    expect(
      await URI.parse("http://10.0.0.1/").findProxy({ REQUEST_METHOD: "GET", HTTP_PROXY: "x" }),
    ).toBeNull();
  it("set_form posts urlencoded params", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("a=1&b=x+y"),
      "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
    );
    const port = await listen(server);
    const req = new Net.HTTP.Post("/f");
    req.setForm([
      ["a", 1],
      ["b", "x y"],
    ]);
    await new Net.HTTP("127.0.0.1", port).request(req);
    expect(seen.received).toContain("Content-Type: application/x-www-form-urlencoded\r\n");
    expect(seen.received).toContain("Content-Length: 9\r\n");
  });

  it("set_form_data replaces the separator and sets the body", () => {
    const req = new Net.HTTP.Post("/f");
    req.setFormData({ a: "1", b: "2" }, ";");
    expect([req.body, req.contentType]).toEqual(["a=1;b=2", "application/x-www-form-urlencoded"]);
    req.formData = { c: "3" };
    expect(req.body).toBe("c=3");
    expect(() => req.setForm({}, "text/plain")).toThrow("invalid enctype: text/plain");
  });

  const multipart =
    '--B\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n' +
    '--B\r\nContent-Disposition: form-data; name="f\\"q"; filename="t.txt"\r\n' +
    "Content-Type: text/plain\r\n\r\nhello\r\n--B--\r\n";

  it("set_form posts multipart form data with a Content-Length", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("--B--\r\n"),
      "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
    );
    const port = await listen(server);
    const req = new Net.HTTP.Post("/m");
    req.setForm(
      [
        ["a", "1"],
        ['f"q', source("hello"), { filename: "t.txt", contentType: "text/plain" }],
      ],
      "multipart/form-data",
      { boundary: "B" },
    );
    await new Net.HTTP("127.0.0.1", port).request(req);
    expect(seen.received).toContain("Content-Type: multipart/form-data; boundary=B\r\n");
    expect(seen.received).toContain(`Content-Length: ${multipart.length}\r\n`);
    expect(seen.received.endsWith(`\r\n\r\n${multipart}`)).toBe(true);
  });

  it("set_form posts chunked multipart form data", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("0\r\n\r\n"),
      "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
    );
    const port = await listen(server);
    const req = new Net.HTTP.Post("/m", { "Transfer-Encoding": "chunked" });
    req.setForm([["a", "1"]], "multipart/form-data", { boundary: "B" });
    await new Net.HTTP("127.0.0.1", port).request(req);
    const body = '--B\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--B--\r\n';
    expect(
      seen.received.endsWith(`\r\n\r\n${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`),
    ).toBe(true);
  });

  it("wait_for_continue answers a final response without sending the body", async () => {
    const { seen, server } = rawServer(
      (r) => r.endsWith("\r\n\r\n"),
      "HTTP/1.1 417 Expectation Failed\r\nContent-Length: 0\r\n\r\n",
    );
    const port = await listen(server);
    const http = new Net.HTTP("127.0.0.1", port);
    http.continueTimeout = 5;
    const res = await http.post("/p", "body", {
      Expect: "100-continue",
      "Content-Type": "text/plain",
    });
    expect(res.code).toBe("417");
    expect(seen.received.endsWith("\r\n\r\n")).toBe(true);
  });

  it("protocol and unreachable errors are seated", () => {
    expect(new Net.ProtocolError("x")).toBeInstanceOf(Error);
    expect(new Errno.EHOSTUNREACH().message).toBe("No route to host");
    expect(new Errno.ENETUNREACH("a").message).toBe("Network is unreachable - a");
  });
});
