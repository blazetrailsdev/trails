import { describe, it, expect } from "vitest";
import type { HttpRequest } from "@blazetrails/activesupport";
import { bodyFromString } from "../index.js";
import type { RackApp, RackEnv } from "../index.js";
import { Node } from "./node.js";

function createMockReq(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}): HttpRequest {
  const listeners: Record<string, ((...args: never[]) => void)[]> = {};
  const req: HttpRequest = {
    method: options.method || "GET",
    url: options.url || "/",
    httpVersion: "1.1",
    headers: { host: "localhost:3000", ...options.headers },
    socket: { remoteAddress: "127.0.0.1" },
    on(event, listener) {
      (listeners[event] ??= []).push(listener);
      return req;
    },
    destroy() {
      return req;
    },
  };

  setTimeout(() => {
    if (options.body !== undefined) {
      for (const listener of listeners["data"] ?? []) {
        (listener as (chunk: Uint8Array) => void)(new TextEncoder().encode(options.body));
      }
    }
    for (const listener of listeners["end"] ?? []) (listener as () => void)();
  }, 0);

  return req;
}

function createMockRes() {
  const res = {
    body: "",
    status: undefined as number | undefined,
    headers: undefined as unknown,
    writeHead(status: number, headers?: Record<string, string | string[]>) {
      res.status = status;
      res.headers = headers;
    },
    write(chunk: string | Uint8Array) {
      res.body += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    },
    end(chunk?: string | Uint8Array) {
      if (chunk !== undefined) res.write(chunk);
    },
  };
  return res;
}

async function metaVarsFor(req: HttpRequest): Promise<RackEnv> {
  let env: RackEnv = {};
  const handler = new Node(async (e) => {
    env = e;
    return [200, {}, bodyFromString("")];
  });
  await handler.service(req, createMockRes());
  return env;
}

describe("Rack::Handler::Node", () => {
  it("builds a Rack env from a basic GET request", async () => {
    const env = await metaVarsFor(createMockReq({ method: "GET", url: "/users?page=2" }));

    expect(env.REQUEST_METHOD).toBe("GET");
    expect(env.PATH_INFO).toBe("/users");
    expect(env.QUERY_STRING).toBe("page=2");
    expect(env.SERVER_PORT).toBe("3000");
    expect(env.HTTP_HOST).toBe("localhost:3000");
    expect(env["rack.url_scheme"]).toBe("http");
  });

  it("reads request body", async () => {
    const env = await metaVarsFor(
      createMockReq({ method: "POST", url: "/users", body: '{"name":"dean"}' }),
    );

    expect(env.REQUEST_METHOD).toBe("POST");
    expect(env["rack.input"]).toBe('{"name":"dean"}');
  });

  it("maps content-type and content-length to CGI keys", async () => {
    const env = await metaVarsFor(
      createMockReq({
        headers: { "content-type": "application/json", "content-length": "15" },
      }),
    );

    expect(env.CONTENT_TYPE).toBe("application/json");
    expect(env.CONTENT_LENGTH).toBe("15");
    expect(env).not.toHaveProperty("HTTP_CONTENT_TYPE");
    expect(env).not.toHaveProperty("HTTP_CONTENT_LENGTH");
  });

  it("maps other headers to HTTP_ prefixed keys", async () => {
    const env = await metaVarsFor(
      createMockReq({ headers: { "x-request-id": "abc-123", accept: "text/html" } }),
    );

    expect(env.HTTP_X_REQUEST_ID).toBe("abc-123");
    expect(env.HTTP_ACCEPT).toBe("text/html");
  });

  it("normalizes array header values to comma-separated strings", async () => {
    const env = await metaVarsFor(createMockReq({ headers: { "set-cookie": ["a=1", "b=2"] } }));

    expect(env.HTTP_SET_COOKIE).toBe("a=1, b=2");
  });

  it("skips undefined header values", async () => {
    const env = await metaVarsFor(createMockReq({ headers: { "x-undefined": undefined } }));
    expect(env).not.toHaveProperty("HTTP_X_UNDEFINED");
  });

  it("sets rack.url_scheme to https when x-forwarded-proto is https", async () => {
    const env = await metaVarsFor(createMockReq({ headers: { "x-forwarded-proto": "https" } }));

    expect(env["rack.url_scheme"]).toBe("https");
  });

  it("sets rack.url_scheme to https for TLS sockets", async () => {
    const req = createMockReq({});
    req.socket.encrypted = true;
    const env = await metaVarsFor(req);

    expect(env["rack.url_scheme"]).toBe("https");
  });

  it("handles comma-separated x-forwarded-proto", async () => {
    const env = await metaVarsFor(
      createMockReq({ headers: { "x-forwarded-proto": "https, http" } }),
    );

    expect(env["rack.url_scheme"]).toBe("https");
  });

  it("sets the CGI meta variables WEBrick supplies", async () => {
    const env = await metaVarsFor(createMockReq({ url: "/users?page=2" }));

    expect(env.GATEWAY_INTERFACE).toBe("CGI/1.1");
    expect(env.SCRIPT_NAME).toBe("");
    expect(env.REQUEST_URI).toBe("/users?page=2");
    expect(env.REQUEST_PATH).toBe("/users");
    expect(env.SERVER_NAME).toBe("localhost");
    expect(env.SERVER_PROTOCOL).toBe("HTTP/1.1");
    expect(env.REMOTE_ADDR).toBe("127.0.0.1");
  });

  it("streams a multi-chunk body", async () => {
    const app: RackApp = async () => [
      200,
      { "content-type": "text/plain" },
      (async function* () {
        yield "one";
        yield "two";
      })(),
    ];
    const res = createMockRes();
    await new Node(app).service(createMockReq({}), res);

    expect(res.status).toBe(200);
    expect(res.headers).toEqual({ "content-type": "text/plain" });
    expect(res.body).toBe("onetwo");
  });

  it("serves the app over HTTP", async () => {
    const app: RackApp = async (env) => [
      201,
      { "content-type": "text/plain" },
      bodyFromString(
        `${env.REQUEST_METHOD as string} ${env.PATH_INFO as string} ${env["rack.input"] as string}`,
      ),
    ];
    const server = await Node.run(app, { Port: 0, Host: "127.0.0.1" });
    try {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/greet`, {
        method: "POST",
        body: "hi",
      });

      expect(response.status).toBe(201);
      expect(await response.text()).toBe("POST /greet hi");
    } finally {
      await Node.shutdown();
    }
  });
});
