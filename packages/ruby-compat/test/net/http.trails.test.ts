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
    expect(new TextDecoder().decode(response.body!)).toBe("hello");
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
    expect((error as Error).message).toBe("Net::ReadTimeout");
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
    expect(new TextDecoder().decode(response.body!)).toBe("ok");

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
    // vendor/ruby/v3.3.11/lib/net/http/requests.rb:31-259
    const H = Net.HTTP as unknown as Record<string, { METHOD: string }>;
    for (const m of ["Get", "Head", "Post", "Put", "Delete", "Options", "Trace", "Patch"]) {
      expect(H[m].METHOD).toBe(m.toUpperCase());
    }
  });

  it("initialize_http_header downcases keys, strips values and rejects CR/LF", () => {
    // vendor/ruby/v3.3.11/lib/net/http/header.rb:185-205
    const req = new Net.HTTP.Get("/", { "X-Foo": " bar ", "X-Nil": null });
    expect(req.get("x-foo")).toBe("bar");
    expect(req.get("x-nil")).toBeNull();
    expect(req.isKey("X-FOO")).toBe(true);
    expect(() => new Net.HTTP.Get("/", { "X-Bad": "a\nb" })).toThrow(
      'header X-Bad has field value "a\\nb", this cannot include CR/LF',
    );
  });

  it("basic_auth, content_length= and content_type= write their headers", () => {
    // vendor/ruby/v3.3.11/lib/net/http/header.rb:637-643, :772-776, :945-962
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
    // vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:120-131, :179-190
    expect(new Net.HTTP.Post("/").isRequestBodyPermitted()).toBe(true);
    expect(new Net.HTTP.Get("/").isRequestBodyPermitted()).toBe(false);
    expect(new Net.HTTP.Head("/").isResponseBodyPermitted()).toBe(false);
    const req = new Net.HTTP.Put("/");
    req.body = "x";
    const io = {};
    expect(req.setBodyStream(io)).toBe(io);
    expect(req.body).toBeNull();
    expect(req.bodyStream).toBe(io);
    expect(() => req.setBodyInternal("y")).toThrow(
      "both of body argument and HTTPRequest#body set",
    );
  });

  it("HTTP's SSL and timeout accessors and set_debug_output", () => {
    // vendor/ruby/v3.3.11/lib/net/http.rb:1188-1191, :1296, :1367-1370, :1479-1516
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
    // vendor/ruby/v3.3.11/lib/net/http/response.rb:355-383, :646-654; header.rb:477-479
    const port = await listen(
      createServer((_req, res) => {
        res.writeHead(200, { "X-A": "1" });
        res.end("hello");
      }),
    );
    const http = new Net.HTTP("127.0.0.1", port);
    const chunks: string[] = [];
    await http.start(async (h) => {
      await h.request(new Net.HTTP.Get("/"), null, (res: InstanceType<typeof Net.HTTPResponse>) => {
        expect(res.toHash()["x-a"]).toEqual(["1"]);
        expect(() => res.readBody("", () => {})).toThrow(
          "both arg and block given for HTTP method",
        );
        res.readBody(null, (c: Uint8Array) => chunks.push(new TextDecoder().decode(c)));
      });
    });
    expect(chunks).toEqual(["hello"]);
  });
});
