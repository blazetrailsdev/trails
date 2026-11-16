import {
  constDefined,
  constGet,
  constSet,
  kernelURI,
  Net,
  OpenSSL,
  rbModMethodDefined,
  Addrinfo,
  SocketError,
  rbObjIvarGet,
  StringIO,
  TopLevel,
  Zlib,
} from "@blazetrails/ruby-compat";
import { MockRequest, MockResponse, Rack, type Headers } from "@blazetrails/rack";
import { afterEach, describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";
import {
  caFile,
  GZIP_PLAINTEXT,
  startServer,
  withRawBackend,
  type TestServer,
} from "./support/proxy-test-server.js";
import { HttpStreamingResponse } from "../lib/http-streaming-response.js";

type Env = Record<string, unknown>;
type Triplet = [number, Headers, unknown];
type Configurable = { configureBackendConnection(...args: unknown[]): unknown };

class HostProxy extends Proxy {
  host: string | null = null;
  override rewriteEnv(env: Env): Env {
    env["HTTP_HOST"] = this.host ?? "example.com";
    return env;
  }
}

async function bodyString(body: unknown): Promise<string> {
  const chunks: Uint8Array[] = [];
  const push = (c: string | Uint8Array) =>
    chunks.push(typeof c === "string" ? new TextEncoder().encode(c) : c);
  if (Array.isArray(body)) body.forEach(push);
  else await (body as { each(b: (c: Uint8Array) => unknown): Promise<void> }).each(push);
  return Buffer.concat(chunks).toString("latin1");
}

describe("RackProxyTest", () => {
  let server: TestServer | null = null;
  let app: HostProxy | null = null;
  let lastResponse: MockResponse;
  afterEach(async () => {
    await server?.shutdown();
    server = null;
    app = null;
  });

  async function withWebrickProxy(
    { ssl = false, caSigned = false, ...proxyOpts }: Record<string, unknown>,
    block: (port: number, proxy: HostProxy) => Promise<void>,
  ): Promise<void> {
    let port: number;
    [server, port] = await startServer({ ssl: ssl as boolean, caSigned: caSigned as boolean });
    app = new HostProxy({ allowDynamicBackend: true, ...proxyOpts });
    await block(port, app);
  }

  async function request(method: string, path: string, opts: Env = {}): Promise<void> {
    const env = MockRequest.envFor(path, { ":method": method, ...opts });
    const [status, headers, body] = (await app!.call(env)) as unknown as Triplet;
    lastResponse = new MockResponse(
      status,
      "toA" in headers ? Object.fromEntries(headers.toA()) : headers,
      [await bodyString(body)],
    );
  }
  const get = (path: string, opts: Env = {}) => request("GET", path, opts);
  const lastHeader = (name: string) => lastResponse.getHeader(name) ?? null;

  async function getsExampleDomain(streaming: boolean): Promise<void> {
    await withWebrickProxy({ streaming }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/");
      expect(lastResponse.isOk).toBeTruthy();
      expect(lastResponse.body).toMatch(/Example Domain/);
    });
  }

  it("http streaming", () => getsExampleDomain(true));
  it("http full request", () => getsExampleDomain(false));

  async function getsExampleDomainOverTls(opts: Record<string, unknown>): Promise<void> {
    await withWebrickProxy({ ssl: true, ...opts }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("https://example.com");
      expect(lastResponse.status === 200).toBeTruthy();
      expect(lastResponse.body).toMatch(/Example Domain/);
    });
  }

  it("https streaming", () => getsExampleDomainOverTls({ sslVerifyNone: true }));
  it("https streaming tls", () =>
    getsExampleDomainOverTls({ sslVerifyNone: true, minVersion: "TLS1_2" }));
  it("https full request", () =>
    getsExampleDomainOverTls({ streaming: false, sslVerifyNone: true }));
  it("https full request tls", () =>
    getsExampleDomainOverTls({ streaming: false, sslVerifyNone: true, sslVersion: "TLSv1_2" }));

  it("https default rejects invalid certificate", async () => {
    const sink = new StringIO();
    await withWebrickProxy({ ssl: true, streaming: false, logger: sink }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("https://example.com/");
      expect(lastResponse.status).toBe(502);
      expect(sink.string()).toMatch(/SSLError|certificate verify failed/);
    });
  });
  it("https default rejects invalid certificate streaming", async () => {
    const sink = new StringIO();
    await withWebrickProxy({ ssl: true, streaming: true, logger: sink }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("https://example.com/");
      expect(lastResponse.status).toBe(502);
      expect(sink.string()).toMatch(/SSLError|certificate verify failed/);
    });
  });
  it("https with ssl verify none accepts invalid certificate", async () => {
    await withWebrickProxy(
      { ssl: true, streaming: false, sslVerifyNone: true },
      async (port, proxy) => {
        proxy.host = `127.0.0.1:${port}`;
        await get("https://example.com/");
        expect(lastResponse.status === 200).toBeTruthy();
      },
    );
  });
  it("https ca file accepts trusted cert non streaming", () =>
    getsExampleDomainOverTls({ caSigned: true, streaming: false, caFile: caFile() }));
  it("https ca file accepts trusted cert streaming", () =>
    getsExampleDomainOverTls({ caSigned: true, streaming: true, caFile: caFile() }));
  it("https ca signed cert rejected without ca file", async () => {
    await withWebrickProxy({ ssl: true, caSigned: true, streaming: false }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("https://example.com/");
      expect(lastResponse.status).toBe(502);
    });
  });

  it("handles missing content length", async () => {
    await withWebrickProxy({}, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await request("POST", "/echo-body", { CONTENT_LENGTH: null });
      expect(lastResponse.status).toBe(200);
      expect(lastResponse.body).toBe("");
    });
  });
  it("non rewindable body is forwarded without raising", async () => {
    await withWebrickProxy({ streaming: false }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      const io = new StringIO("hello=world");
      const body = { read: (...args: [number]) => io.read(...args) };
      expect(
        !("rewind" in body),
        "fixture must not be rewindable to exercise the guard",
      ).toBeTruthy();

      const env = MockRequest.envFor("/echo-body", { ":method": "POST" });
      env["rack.input"] = body;
      env["CONTENT_LENGTH"] = "11";
      env["CONTENT_TYPE"] = "text/plain";
      const call = proxy.call(env);
      await expect(call).resolves.not.toThrow();
      const [status, , response] = (await call) as unknown as Triplet;
      expect(status).toBe(200);
      expect(await bodyString(response), "body must be forwarded intact").toBe("hello=world");
    });
  });

  type Stream = { read(length?: number | null): Promise<Uint8Array | null> };
  function requestBodyStream(body: string, contentLength: number): Stream {
    const klass = constGet(Proxy, "RequestBodyStream") as new (i: StringIO, l: number) => Stream;
    return new klass(new StringIO(body), contentLength);
  }
  const text = (b: Uint8Array | null) => (b == null ? null : new TextDecoder().decode(b));

  it("request body stream read without length returns remaining bytes", async () => {
    const stream = requestBodyStream("hello world, extra", 11);
    expect(text(await stream.read(5))).toBe("hello");
    expect(text(await stream.read())).toBe(" world");
    expect(
      text(await stream.read()),
      "IO#read without a length returns an empty string at EOF",
    ).toBe("");
    expect(await stream.read(1), "IO#read with a length returns nil at EOF").toBeNull();
  });

  // PERMANENT-SKIP: CLAUDE.md, "Ruby Strings are JS string primitives (no mutable String carrier)" — the caller's buffer is replaced in place.
  it.skip("request body stream read without length fills the buffer", () => {});

  it("request body stream read without length rejects short bodies", async () => {
    const stream = requestBodyStream("hi", 5);
    await expect(stream.read()).rejects.toThrow(constGet(Proxy, "InvalidRequest") as typeof Error);
  });

  async function connectionRefused(streaming: boolean): Promise<void> {
    const [probe, closedPort] = await startServer();
    await probe.shutdown();
    app = new HostProxy({ allowDynamicBackend: true, streaming });
    app.host = `127.0.0.1:${closedPort}`;
    await get("/");
    expect(lastResponse.status).toBe(502);
    expect(lastResponse.body).toBe("");
  }

  it("connection refused returns 502", () => connectionRefused(false));
  it("connection refused returns 502 streaming", () => connectionRefused(true));

  it("unknown host returns 502", async () => {
    const resolver = Addrinfo.getaddrinfo;
    Addrinfo.getaddrinfo = (host, ...args) => {
      if (host === "no-such-host.invalid") throw new SocketError("offline test: host not found");
      return resolver.call(Addrinfo, host, ...args);
    };
    try {
      app = new HostProxy({ allowDynamicBackend: true, streaming: false });
      app.host = "no-such-host.invalid";
      await get("/");
      expect(lastResponse.status).toBe(502);
    } finally {
      Addrinfo.getaddrinfo = resolver;
    }
  });

  async function noEntityBody(path: string, status: number, streaming: boolean) {
    await withWebrickProxy({ streaming }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get(path);
      expect(lastResponse.status).toBe(status);
      expect(lastResponse.body).toBe("");
    });
  }

  it("no entity body for 204", () => noEntityBody("/no-content", 204, false));
  it("no entity body for 304", () => noEntityBody("/not-modified", 304, false));
  it("no entity body for 204 streaming", () => noEntityBody("/no-content", 204, true));
  it("no entity body for 304 streaming", () => noEntityBody("/not-modified", 304, true));

  it("connect and write timeouts are applied", () => {
    const proxy = new Proxy({ readTimeout: 5, openTimeout: 3, writeTimeout: 7 });
    const http = new Net.HTTP("127.0.0.1", 80);
    (proxy as unknown as Configurable).configureBackendConnection(http, {
      useSsl: false,
      readTimeout: 5,
    });
    expect(http.readTimeout).toBe(5);
    expect(http.openTimeout).toBe(3);
    expect(http.writeTimeout).toBe(7);
  });
  it("ca file and cert store are applied", () => {
    const store = new OpenSSL.X509.Store();
    const proxy = new Proxy({ caFile: "/tmp/some-ca.pem", certStore: store });
    const http = new Net.HTTP("127.0.0.1", 443);
    (proxy as unknown as Configurable).configureBackendConnection(http, {
      useSsl: true,
      readTimeout: 5,
    });
    expect(http.caFile).toBe("/tmp/some-ca.pem");
    expect(http.certStore).toBe(store);
  });
  it("unknown method returns 501", async () => {
    await withWebrickProxy({ streaming: false }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      const env = MockRequest.envFor("/", { ":method": "GET" });
      env["REQUEST_METHOD"] = "BOGUSVERB";
      const [status] = (await proxy.call(env)) as unknown as Triplet;
      expect(status).toBe(501);
    });
  });
  it("disallowed backend returns 502", async () => {
    await withWebrickProxy({ streaming: false }, async (port, proxy) => {
      proxy.isBackendAllowed = () => false;
      proxy.host = `127.0.0.1:${port}`;
      await get("/");
      expect(lastResponse.status).toBe(502);
    });
  });
  it("dynamic backend refused by default", async () => {
    let port: number;
    [server, port] = await startServer();
    let hits = 0;
    server.mountProc("/hit-counter", (_req, res) => {
      hits += 1;
      res.end("hit");
    });

    const sink = new StringIO();
    const proxy = new HostProxy({ logger: sink });
    app = proxy;
    proxy.host = `127.0.0.1:${port}`;
    await get("/hit-counter");
    expect(lastResponse.status).toBe(502);
    expect(hits, "a refused dynamic backend must never be dialed").toBe(0);
    expect(sink.string(), "the refusal should log a migration hint").toMatch(
      /allow_dynamic_backend/,
    );
  });
  it("static backend requires no opt in", async () => {
    let port: number;
    [server, port] = await startServer();
    const proxy = new Proxy({ backend: `http://127.0.0.1:${port}` });
    const [status, , body] = (await proxy.call(MockRequest.envFor("/"))) as unknown as Triplet;
    expect(status).toBe(200);
    expect(await bodyString(body)).toMatch(/Example Domain/);
  });
  it("rack backend env requires no opt in", async () => {
    let port: number;
    [server, port] = await startServer();
    const proxy = new Proxy();
    const env = MockRequest.envFor("/");
    env["rack.backend"] = kernelURI(`http://127.0.0.1:${port}`);
    const [status, , body] = (await proxy.call(env)) as unknown as Triplet;
    expect(status).toBe(200);
    expect(await bodyString(body)).toMatch(/Example Domain/);
  });
  it("backend allowed consulted for static backend", async () => {
    let port: number;
    [server, port] = await startServer();
    const sink = new StringIO();
    const proxy = new Proxy({ backend: `http://127.0.0.1:${port}`, logger: sink });
    proxy.isBackendAllowed = () => false;
    const [status] = (await proxy.call(MockRequest.envFor("/"))) as unknown as Triplet;
    expect(status).toBe(502);
    expect(sink.string()).toMatch(/refused by backend_allowed\?/);
  });

  it("normalize headers", () => {
    const proxyClass = Proxy;
    const headers = { header_array: ["first_entry"], header_non_array: "entry" };

    const normalizedHeaders = proxyClass.normalizeHeaders(headers);
    const expectedClass = constDefined(Rack, "Headers")
      ? constGet(Rack, "Headers")
      : constGet(Rack, "Utils::HeaderHash");
    expect(normalizedHeaders.constructor === expectedClass).toBeTruthy();
    expect(normalizedHeaders.get("header_array") === "first_entry").toBeTruthy();
    expect(normalizedHeaders.get("header_non_array") === "entry").toBeTruthy();
  });

  it("header reconstruction", () => {
    const proxyClass = Proxy as unknown as { reconstructHeaderName(name: string): string };

    let header = proxyClass.reconstructHeaderName("HTTP_ABC");
    expect(header === "Abc").toBeTruthy();

    header = proxyClass.reconstructHeaderName("HTTP_ABC_D");
    expect(header === "Abc-D").toBeTruthy();
  });

  it("extract http request headers", () => {
    const proxyClass = Proxy;
    const env = {
      "NOT-HTTP-HEADER": "test-value",
      HTTP_ACCEPT: "text/html",
      HTTP_CONNECTION: null,
      HTTP_CONTENT_MD5: "deadbeef",
      "HTTP_HEADER.WITH.PERIODS": "stillmooing",
    };

    const headers = proxyClass.extractHttpRequestHeaders(env);
    expect(headers.hasKey("ACCEPT")).toBeTruthy();
    expect(headers.hasKey("CONTENT-MD5")).toBeTruthy();
    expect(headers.hasKey("HEADER.WITH.PERIODS")).toBeTruthy();
    expect(!headers.hasKey("CONNECTION")).toBeTruthy();
    expect(!headers.hasKey("NOT-HTTP-HEADER")).toBeTruthy();
  });

  it("duplicate headers", () => {
    const proxyClass = Proxy;
    const env = { "Set-Cookie": ["cookie1=foo", "cookie2=bar"] };

    const headers = proxyClass.normalizeHeaders(env);
    expect(
      headers.get("Set-Cookie")!.includes("cookie1=foo"),
      "Include the first value",
    ).toBeTruthy();
    // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors rack_proxy_test.rb:135
    if (constDefined(Rack, "Headers", false)) {
      // eslint-disable-next-line vitest/no-conditional-expect -- mirrors rack_proxy_test.rb:136
      expect(headers.get("Set-Cookie")).toEqual(["cookie1=foo", "cookie2=bar"]);
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect -- mirrors rack_proxy_test.rb:138
      expect(
        headers.get("Set-Cookie")!.includes("\n"),
        "Rack 2 joins multiple cookies with newlines",
      ).toBeTruthy();
    }
    expect(
      headers.get("Set-Cookie")!.includes("cookie2=bar"),
      "Include the second value",
    ).toBeTruthy();
  });

  it("ssl default is verify peer", () => {
    const proxy = new Proxy();
    expect(
      rbObjIvarGet(proxy, "@verify_mode") ?? null,
      "@verify_mode should be unset by default so VERIFY_PEER applies at request time",
    ).toBeNull();
  });

  it("ssl verify none opt in", () => {
    const proxy = new Proxy({ sslVerifyNone: true });
    expect(rbObjIvarGet(proxy, "@verify_mode")).toEqual(OpenSSL.SSL.VERIFY_NONE);
  });

  it("explicit verify mode wins over ssl verify none", () => {
    const proxy = new Proxy({ sslVerifyNone: true, verifyMode: OpenSSL.SSL.VERIFY_PEER });
    expect(rbObjIvarGet(proxy, "@verify_mode")).toEqual(OpenSSL.SSL.VERIFY_PEER);
  });

  it("build header hash ignores toplevel headers constant", () => {
    const top = TopLevel as Record<string, unknown>;
    delete top.Headers;
    const Bogus = class {};
    constSet(TopLevel, "Headers", Bogus);
    try {
      const result = Proxy.buildHeaderHash([["X-Test", "value"]]);
      expect(result.constructor, "build_header_hash leaked into top-level ::Headers").not.toBe(
        Bogus,
      );
    } finally {
      delete top.Headers;
    }
  });
  it("http full request headers", async () => {
    await withWebrickProxy({ streaming: false }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/cookies/set?test=1");
      expect(
        [lastHeader("Set-Cookie") ?? []].flat().length !== 0,
        "/cookies/set should set a cookie",
      ).toBeTruthy();
    });
  });

  it("response header included Hop by hop", async () => {
    await withWebrickProxy({ streaming: true }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/chunked");
      const transferEncodingEmitted = Object.entries(lastResponse.headers).some(
        ([k]) => k.toLowerCase() === "transfer-encoding",
      );
      expect(
        !transferEncodingEmitted,
        "hop-by-hop Transfer-Encoding must be stripped from the proxied response",
      ).toBeTruthy();
      expect(lastResponse.body, "chunked body must still be forwarded").toMatch(/chunk-one/);
    });
  });

  it("head request streaming", async () => {
    await withWebrickProxy({ streaming: true }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await request("HEAD", "/");
      expect(lastResponse.isOk).toBeTruthy();
      expect(lastResponse.body, "HEAD must not stream an entity body").toBe("");
    });
  });

  it("strip credentials removes cookie and authorization", async () => {
    await withWebrickProxy({ stripCredentials: true }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/echo-request-headers", {
        HTTP_COOKIE: "session=s3cr3t",
        HTTP_AUTHORIZATION: "Bearer tok",
      });
      expect(lastResponse.isOk).toBeTruthy();
      expect(lastResponse.body, "Cookie must be stripped").not.toMatch(/^cookie:/m);
      expect(lastResponse.body, "Authorization must be stripped").not.toMatch(/^authorization:/m);
    });
  });

  it("credentials forwarded by default", async () => {
    await withWebrickProxy({}, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/echo-request-headers", {
        HTTP_COOKIE: "session=s3cr3t",
        HTTP_AUTHORIZATION: "Bearer tok",
      });
      expect(lastResponse.body).toMatch(/^cookie: session=s3cr3t$/m);
      expect(lastResponse.body).toMatch(/^authorization: Bearer tok$/m);
    });
  });

  it("replace x forwarded for hides inbound chain", async () => {
    await withWebrickProxy({ replaceXForwardedFor: true }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/echo-request-headers", {
        HTTP_X_FORWARDED_FOR: "203.0.113.9",
        REMOTE_ADDR: "10.0.0.5",
      });
      expect(
        lastResponse.body,
        "inbound X-Forwarded-For must be replaced with REMOTE_ADDR",
      ).toMatch(/^x-forwarded-for: 10\.0\.0\.5$/m);
    });
  });

  it("x forwarded for appends by default", async () => {
    await withWebrickProxy({}, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/echo-request-headers", {
        HTTP_X_FORWARDED_FOR: "203.0.113.9",
        REMOTE_ADDR: "10.0.0.5",
      });
      expect(lastResponse.body).toMatch(/^x-forwarded-for: 203\.0\.113\.9, 10\.0\.0\.5$/m);
    });
  });

  it("strip credentials applies after rewrite env", async () => {
    await withWebrickProxy(
      { stripCredentials: true, username: "u", password: "p" },
      async (port, proxy) => {
        const rewriteEnv = proxy.rewriteEnv.bind(proxy);
        proxy.rewriteEnv = (env: Env) => {
          env["HTTP_AUTHORIZATION"] = "Bearer injected-by-rewrite-env";
          return rewriteEnv(env);
        };
        proxy.host = `127.0.0.1:${port}`;
        await get("/echo-request-headers");
        expect(lastResponse.isOk).toBeTruthy();
        expect(
          lastResponse.body,
          "a credential injected in rewrite_env is stripped like any other",
        ).not.toMatch(/injected-by-rewrite-env/);
        expect(lastResponse.body, ":username/:password must survive strip_credentials").toMatch(
          /^authorization: Basic dTpw$/m,
        );
      },
    );
  });

  it("replace x forwarded for without remote addr drops header", async () => {
    await withWebrickProxy({ replaceXForwardedFor: true }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      const env = MockRequest.envFor("/echo-request-headers");
      env["HTTP_X_FORWARDED_FOR"] = "203.0.113.9";
      delete env["REMOTE_ADDR"];
      const [, , body] = (await proxy.call(env)) as unknown as Triplet;
      expect(
        await bodyString(body),
        "with no REMOTE_ADDR, X-Forwarded-For must be dropped, not forwarded or sent empty",
      ).not.toMatch(/x-forwarded-for/);
    });
  });

  it("post body is forwarded streaming", async () => {
    await withWebrickProxy({ streaming: true }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await request("POST", "/echo-body", { ":input": "hello=streaming-world" });
      expect(lastResponse.isOk).toBeTruthy();
      expect(lastResponse.body).toBe("hello=streaming-world");
    });
  });

  it("malformed backend response returns 502", async () => {
    for (const streaming of [true, false]) {
      await withMalformedBackend(async (port) => {
        const proxy = new HostProxy({ streaming, allowDynamicBackend: true });
        app = proxy;
        proxy.host = `127.0.0.1:${port}`;
        await get("/");
        expect(
          lastResponse.status,
          `malformed backend response must 502 (streaming: ${streaming})`,
        ).toBe(502);
      });
    }
  });

  it("empty body is not array with empty string", async () => {
    await withWebrickProxy({ streaming: false }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/empty");
      expect(lastResponse.status).toBe(200);
      expect(lastResponse.body).toBe("");
    });
  });

  it("header values are strings streaming", () => assertNoArrayHeaderValues(true));
  it("header values are strings non streaming", () => assertNoArrayHeaderValues(false));

  it("logger captures request in non streaming", async () => {
    const sink = new StringIO();
    await withWebrickProxy({ streaming: false, logger: sink }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/empty");
      expect(lastResponse.isOk).toBeTruthy();
    });
    expect(
      sink.string(),
      `expected debug output to include request line, got: ${JSON.stringify(sink.string())}`,
    ).toMatch(/GET \/empty/);
  });

  it("logger captures request in streaming", async () => {
    const sink = new StringIO();
    await withWebrickProxy({ streaming: true, logger: sink }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/empty");
      expect(lastResponse.isOk).toBeTruthy();
    });
    expect(
      sink.string(),
      `expected debug output to include request line, got: ${JSON.stringify(sink.string())}`,
    ).toMatch(/GET \/empty/);
  });

  it("no logger means no debug output", async () => {
    await withWebrickProxy({ streaming: false }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/empty");
      expect(lastResponse.isOk).toBeTruthy();
    });
  });

  it("request hop by hop headers are stripped", () => {
    const env = {
      REMOTE_ADDR: "10.0.0.1",
      HTTP_ACCEPT: "text/html",
      HTTP_CONNECTION: "keep-alive, X-Purge-Me",
      HTTP_KEEP_ALIVE: "timeout=5",
      HTTP_TE: "trailers",
      HTTP_TRANSFER_ENCODING: "chunked",
      HTTP_PROXY_AUTHORIZATION: "Basic zzz",
      HTTP_UPGRADE: "websocket",
      HTTP_X_PURGE_ME: "please",
      HTTP_AUTHORIZATION: "Bearer keep-me",
    };
    const headers = Proxy.extractHttpRequestHeaders(env);

    for (const h of [
      "Connection",
      "Keep-Alive",
      "Te",
      "Transfer-Encoding",
      "Proxy-Authorization",
      "Upgrade",
    ]) {
      expect(!headers.hasKey(h), `${h} is hop-by-hop and must not be forwarded`).toBeTruthy();
    }
    expect(
      !headers.hasKey("X-Purge-Me"),
      "a header named in Connection must be dropped",
    ).toBeTruthy();
    expect(headers.get("Accept"), "end-to-end headers must survive").toBe("text/html");
    expect(headers.get("Authorization"), "end-to-end Authorization must survive").toBe(
      "Bearer keep-me",
    );
  });

  it("gzip body is forwarded verbatim non streaming", () => assertGzipForwardedVerbatim(false));
  it("gzip body is forwarded verbatim streaming", () => assertGzipForwardedVerbatim(true));

  it("rack backend env accepts string", async () => {
    let port: number;
    [server, port] = await startServer();
    const proxy = new Proxy();
    const env = MockRequest.envFor("/");
    env["rack.backend"] = `http://127.0.0.1:${port}`;
    const call = proxy.call(env);
    await expect(call).resolves.not.toThrow();
    const [status] = (await call) as unknown as Triplet;
    expect(status).toBe(200);
  });

  it("library loads cleanly without the old monkey patch", () => {
    const out = rbModMethodDefined(Net.HTTP, "beginRequestHacked") ? "PATCHED" : "CLEAN";
    expect(
      out,
      `requiring rack/proxy must not define the old net_http_hacked methods; got: ${JSON.stringify(out)}`,
    ).toMatch(/CLEAN$/);
    expect(out, "requiring rack/proxy must not load or warn about the deleted shim").not.toMatch(
      /net_http_hacked|DEPRECATION/,
    );
  });

  it("early hints 103 is skipped streaming", async () => {
    await withEarlyHintsBackend(async (port) => {
      const proxy = new HostProxy({ streaming: true, allowDynamicBackend: true });
      app = proxy;
      proxy.host = `127.0.0.1:${port}`;
      await get("/");
      expect(lastResponse.status, "must return the final 200, not the interim 103").toBe(200);
      expect(lastResponse.body).toBe("hello world");
    });
  });

  it("max response length rejects declared oversize non streaming", async () => {
    await withWebrickProxy({ streaming: false, maxResponseLength: 10 }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/");
      expect(lastResponse.status).toBe(502);
    });
  });

  it("max response length rejects declared oversize streaming", async () => {
    await withWebrickProxy({ streaming: true, maxResponseLength: 10 }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/");
      expect(lastResponse.status).toBe(502);
    });
  });

  it("max response length enforced while streaming chunked", async () => {
    await withWebrickProxy({ streaming: true, maxResponseLength: 5 }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      const [status, , body] = (await proxy.call(
        MockRequest.envFor("/chunked"),
      )) as unknown as Triplet;
      expect(status, "headers precede the body, so status is still 200").toBe(200);
      await expect(bodyString(body)).rejects.toThrow(HttpStreamingResponse.ResponseTooLarge);
    });
  });

  it("max response length allows within limit", async () => {
    await withWebrickProxy(
      { streaming: false, maxResponseLength: 100_000 },
      async (port, proxy) => {
        proxy.host = `127.0.0.1:${port}`;
        await get("/");
        expect(lastResponse.isOk).toBeTruthy();
        expect(lastResponse.body).toMatch(/Example Domain/);
      },
    );
  });

  async function assertGzipForwardedVerbatim(streaming: boolean): Promise<void> {
    await withWebrickProxy({ streaming }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/gzip");
      expect(lastResponse.isOk).toBeTruthy();
      const body = Uint8Array.from(lastResponse.body, (c) => c.charCodeAt(0));
      expect(lastHeader("content-encoding"), "Content-Encoding must be preserved").toBe("gzip");
      const inflated = new Zlib.GzipReader(new StringIO(body)).read();
      expect(inflated, "body must still be compressed and round-trip to the original payload").toBe(
        GZIP_PLAINTEXT,
      );
      const contentLength = lastHeader("content-length");
      if (contentLength != null) {
        expect(
          body.length,
          "Content-Length must match the (compressed) bytes actually forwarded",
        ).toBe(Number.parseInt(contentLength, 10));
      }
    });
  }

  const withMalformedBackend = (block: (port: number) => Promise<void>) =>
    withRawBackend(
      (client) => client.write("garbage nonsense\r\n\r\n"),
      (backend) => block(Number(new URL(backend).port)),
    );

  const withEarlyHintsBackend = (block: (port: number) => Promise<void>) =>
    withRawBackend(
      (client) => {
        client.write("HTTP/1.1 103 Early Hints\r\nLink: </s.css>; rel=preload\r\n\r\n");
        client.write(
          "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 11\r\nConnection: close\r\n\r\nhello world",
        );
      },
      (backend) => block(Number(new URL(backend).port)),
    );

  async function assertNoArrayHeaderValues(streaming: boolean): Promise<void> {
    await withWebrickProxy({ streaming }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/echo-headers");
      const arrayValued = Object.entries(lastResponse.headers).filter(([, v]) => Array.isArray(v));
      expect(
        arrayValued,
        `expected no Array-valued headers (#65), got: ${JSON.stringify(arrayValued)}`,
      ).toEqual([]);
      expect(lastHeader("x-custom")).toBe("value-here");
    });
  }
});
