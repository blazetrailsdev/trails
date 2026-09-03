import { describe, it, expect } from "vitest";
import type { StringIO } from "@blazetrails/activesupport";
import type { HttpRequest, HttpResponse } from "@blazetrails/ruby-compat";
import { bodyFromString } from "../index.js";
import type { RackApp, RackBody, RackEnv } from "../index.js";
import { Node } from "./node.js";

async function serving(app: RackApp, body: (url: string) => Promise<void>): Promise<void> {
  const server = await Node.run(app, { Port: 0, Host: "127.0.0.1" });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  try {
    await body(`http://127.0.0.1:${port}`);
  } finally {
    await Node.shutdown();
  }
}

async function envFor(path: string, init?: RequestInit): Promise<RackEnv> {
  let env: RackEnv = {};
  await serving(
    async (e) => {
      env = e;
      return [200, {}, bodyFromString("")];
    },
    async (url) => void (await fetch(`${url}${path}`, init)),
  );
  return env;
}

async function mockReq(req: Partial<HttpRequest>): Promise<HttpRequest> {
  const listeners: Record<string, ((...args: never[]) => void)[]> = {};
  const built = {
    method: "GET",
    url: "/",
    httpVersion: "1.1",
    headers: { host: "localhost:3000" },
    socket: { remoteAddress: "127.0.0.1" },
    on(event: string, listener: (...args: never[]) => void) {
      (listeners[event] ??= []).push(listener);
      return built;
    },
    destroy() {},
    ...req,
  } as unknown as HttpRequest;
  setTimeout(() => {
    for (const listener of listeners["end"] ?? []) (listener as () => void)();
  }, 0);
  return built;
}

async function metaVars(req: Partial<HttpRequest>): Promise<RackEnv> {
  const app: RackApp = async () => [200, {}, bodyFromString("")];
  return new Node(app).metaVars(await mockReq(req));
}

describe("Rack::Handler::Node", () => {
  it("builds a Rack env from a basic GET request", async () => {
    const env = await envFor("/users?page=2");

    expect(env.REQUEST_METHOD).toBe("GET");
    expect(env.PATH_INFO).toBe("/users");
    expect(env.QUERY_STRING).toBe("page=2");
    expect(env.HTTP_HOST).toBe(env.SERVER_NAME + ":" + env.SERVER_PORT);
    expect(env["rack.url_scheme"]).toBe("http");
    expect(env.GATEWAY_INTERFACE).toBe("CGI/1.1");
    expect(env.SCRIPT_NAME).toBe("");
    expect(env.REQUEST_URI).toBe(`http://${env.HTTP_HOST as string}/users?page=2`);
    expect(env.REQUEST_PATH).toBe("/users");
    expect(env.SERVER_PROTOCOL).toBe("HTTP/1.1");
    expect(env.REMOTE_ADDR).toBe("127.0.0.1");
    expect(env.REMOTE_HOST).toBe("127.0.0.1");
    expect(env).not.toHaveProperty("REMOTE_USER");
  });

  it("reads request body", async () => {
    const env = await envFor("/users", { method: "POST", body: '{"name":"dean"}' });

    expect(env.REQUEST_METHOD).toBe("POST");
    const input = env["rack.input"] as StringIO;
    expect(typeof input.read).toBe("function");
    expect(input.read()).toBe('{"name":"dean"}');
  });

  it("reads a binary request body byte-identically", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89,
    ]);
    const env = await envFor("/upload", {
      method: "POST",
      body: png,
      headers: { "content-type": "application/octet-stream" },
    });

    const input = env["rack.input"] as StringIO;
    expect(input.size).toBe(png.length);
    const read = input.read() as string;
    expect(Array.from(read, (c) => c.charCodeAt(0))).toEqual(Array.from(png));
  });

  it("maps content-type and content-length to CGI keys", async () => {
    const env = await envFor("/", {
      method: "POST",
      body: "a=1",
      headers: { "content-type": "application/json" },
    });

    expect(env.CONTENT_TYPE).toBe("application/json");
    expect(env.CONTENT_LENGTH).toBe("3");
    expect(env).not.toHaveProperty("HTTP_CONTENT_TYPE");
    expect(env).not.toHaveProperty("HTTP_CONTENT_LENGTH");
  });

  it("maps other headers to HTTP_ prefixed keys", async () => {
    const env = await envFor("/", { headers: { "x-request-id": "abc-123", accept: "text/html" } });

    expect(env.HTTP_X_REQUEST_ID).toBe("abc-123");
    expect(env.HTTP_ACCEPT).toBe("text/html");
  });

  it("normalizes array header values to comma-separated strings", async () => {
    const env = await metaVars({ headers: { host: "x", "set-cookie": ["a=1", "b=2"] } });

    expect(env.HTTP_SET_COOKIE).toBe("a=1, b=2");
  });

  it("skips undefined header values", async () => {
    const env = await metaVars({ headers: { host: "x", "x-undefined": undefined } });

    expect(env).not.toHaveProperty("HTTP_X_UNDEFINED");
  });

  it("sets rack.url_scheme to https for TLS sockets", async () => {
    const env = await metaVars({ socket: { remoteAddress: "127.0.0.1", encrypted: true } });

    expect(env.HTTPS).toBe("on");
    expect(env.REQUEST_URI).toBe("https://localhost:3000/");
  });

  it("collapses leading slashes rather than reading an authority", async () => {
    const env = await metaVars({ url: "//evil.example/x" });

    expect(env.REQUEST_URI).toBe("http://localhost:3000/evil.example/x");
    expect(env.PATH_INFO).toBe("/evil.example/x");
  });

  it("skips rack. headers and keeps set-cookie repeatable", async () => {
    const headers = {
      "rack.protocol": "websocket",
      "set-cookie": ["a=1", "b=2"],
      vary: ["accept", "origin"],
    } as unknown as Record<string, string>;

    await serving(
      async () => [200, headers, bodyFromString("")],
      async (url) => {
        const response = await fetch(url);

        expect(response.headers.get("rack.protocol")).toBeNull();
        expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
        expect(response.headers.get("vary")).toBe("accept, origin");
      },
    );
  });

  it("keeps the raw path request_uri carries", async () => {
    const env = await envFor("/a%20b/c");

    expect(env.PATH_INFO).toBe("/a%20b/c");
    expect(env.REQUEST_PATH).toBe("/a%20b/c");
    expect(env.REQUEST_URI).toBe(`http://${env.HTTP_HOST as string}/a%20b/c`);
  });

  it("closes the body when the response cannot be written", async () => {
    let closed = false;
    const body = {
      async *[Symbol.asyncIterator]() {
        yield "never";
      },
      async return() {
        closed = true;
        return { done: true as const, value: undefined };
      },
    };
    const app: RackApp = async () => [200, {}, body as unknown as RackBody];
    const boom = new Error("headers already sent");
    const res = {
      writeHead() {
        throw boom;
      },
      write() {},
      end() {},
    };

    await expect(
      new Node(app).service(await mockReq({}), res as unknown as HttpResponse),
    ).rejects.toThrow(boom);
    expect(closed).toBe(true);
  });

  it("streams a multi-chunk body", async () => {
    const app: RackApp = async () => [
      201,
      { "content-type": "text/plain" },
      (async function* () {
        yield "one";
        yield "two";
      })(),
    ];

    await serving(app, async (url) => {
      const response = await fetch(url);

      expect(response.status).toBe(201);
      expect(response.headers.get("content-type")).toBe("text/plain");
      expect(await response.text()).toBe("onetwo");
    });
  });
});
