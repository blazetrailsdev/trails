import {
  constDefined,
  constGet,
  constSet,
  kernelURI,
  Net,
  OpenSSL,
  rbObjIvarGet,
  StringIO,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { MockRequest, Rack, type Headers } from "@blazetrails/rack";
import { afterEach, describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";
import { startServer, type TestServer } from "./support/proxy-test-server.js";

type Env = Record<string, unknown>;
type Triplet = [number, Headers, unknown];

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
  let lastResponse: { status: number; headers: Headers; body: string };

  afterEach(async () => {
    await server?.shutdown();
    server = null;
    app = null;
  });

  async function withWebrickProxy(
    proxyOpts: Record<string, unknown>,
    block: (port: number, proxy: HostProxy) => Promise<void>,
  ): Promise<void> {
    let port: number;
    [server, port] = await startServer();
    app = new HostProxy({ allowDynamicBackend: true, ...proxyOpts });
    await block(port, app);
  }

  async function request(method: string, path: string, opts: Env = {}): Promise<void> {
    const env = MockRequest.envFor(path, { ":method": method, ...opts });
    const [status, headers, body] = (await app!.call(env)) as unknown as Triplet;
    lastResponse = { status, headers, body: await bodyString(body) };
  }
  const get = (path: string) => request("GET", path);

  it("http streaming", async () => {
    await withWebrickProxy({}, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/");
      expect(lastResponse.status).toBe(200);
      expect(lastResponse.body).toMatch(/Example Domain/);
    });
  });

  it("http full request", async () => {
    await withWebrickProxy({ streaming: false }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/");
      expect(lastResponse.status).toBe(200);
      expect(lastResponse.body).toMatch(/Example Domain/);
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
      expect(!("rewind" in body), "fixture must not be rewindable to exercise the guard").toBe(
        true,
      );

      const env = MockRequest.envFor("/echo-body", { ":method": "POST" });
      env["rack.input"] = body;
      env["CONTENT_LENGTH"] = "11";
      env["CONTENT_TYPE"] = "text/plain";

      const [status, , response] = (await proxy.call(env)) as unknown as Triplet;
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

  for (const [name, streaming] of [
    ["connection refused returns 502", false],
    ["connection refused returns 502 streaming", true],
  ] as const) {
    it(name, async () => {
      const [probe, closedPort] = await startServer();
      await probe.shutdown();
      app = new HostProxy({ allowDynamicBackend: true, streaming });
      app.host = `127.0.0.1:${closedPort}`;
      await get("/");
      expect(lastResponse.status).toBe(502);
      expect(lastResponse.body).toBe("");
    });
  }

  for (const [name, path, status, streaming] of [
    ["no entity body for 204", "/no-content", 204, false],
    ["no entity body for 304", "/not-modified", 304, false],
    ["no entity body for 204 streaming", "/no-content", 204, true],
    ["no entity body for 304 streaming", "/not-modified", 304, true],
  ] as const) {
    it(name, async () => {
      await withWebrickProxy({ streaming }, async (port, proxy) => {
        proxy.host = `127.0.0.1:${port}`;
        await get(path);
        expect(lastResponse.status).toBe(status);
        expect(lastResponse.body).toBe("");
      });
    });
  }

  it("empty body is not array with empty string", async () => {
    await withWebrickProxy({ streaming: false }, async (port, proxy) => {
      proxy.host = `127.0.0.1:${port}`;
      await get("/empty");
      expect(lastResponse.status).toBe(200);
      expect(lastResponse.body).toBe("");
    });
  });

  it("connect and write timeouts are applied", () => {
    const proxy = new Proxy({ readTimeout: 5, openTimeout: 3, writeTimeout: 7 });
    const http = new Net.HTTP("127.0.0.1", 80);
    (
      proxy as unknown as { configureBackendConnection: (...args: unknown[]) => unknown }
    ).configureBackendConnection(http, { useSsl: false, readTimeout: 5 });
    expect(http.readTimeout).toBe(5);
    expect(http.openTimeout).toBe(3);
    expect(http.writeTimeout).toBe(7);
  });

  it("ca file and cert store are applied", () => {
    const store = new OpenSSL.X509.Store();
    const proxy = new Proxy({ caFile: "/tmp/some-ca.pem", certStore: store });
    const http = new Net.HTTP("127.0.0.1", 443);
    (
      proxy as unknown as { configureBackendConnection: (...args: unknown[]) => unknown }
    ).configureBackendConnection(http, { useSsl: true, readTimeout: 5 });
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
});
