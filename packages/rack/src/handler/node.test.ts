import { describe, it, expect } from "vitest";
import type { HttpRequest, StringIO } from "@blazetrails/activesupport";
import { bodyFromString } from "../index.js";
import type { RackApp, RackEnv } from "../index.js";
import { Node } from "./node.js";

/** Serve `app` on an ephemeral port, run `body` against it, then shut down. */
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

/** The env one real request builds, as the app saw it. */
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

/** For the two shapes a real socket cannot produce, `meta_vars` is called direct. */
function metaVars(req: Partial<HttpRequest>): Promise<RackEnv> {
  const app: RackApp = async () => [200, {}, bodyFromString("")];
  return new Node(app).metaVars({
    method: "GET",
    url: "/",
    httpVersion: "1.1",
    headers: { host: "localhost:3000" },
    socket: { remoteAddress: "127.0.0.1" },
    ...req,
  } as HttpRequest);
}

describe("Rack::Handler::Node", () => {
  it("builds a Rack env from a basic GET request", async () => {
    const env = await envFor("/users?page=2");

    expect(env.REQUEST_METHOD).toBe("GET");
    expect(env.PATH_INFO).toBe("/users");
    expect(env.QUERY_STRING).toBe("page=2");
    expect(env.HTTP_HOST).toBe(env.SERVER_NAME + ":" + env.SERVER_PORT);
    expect(env["rack.url_scheme"]).toBe("http");
  });

  it("reads request body", async () => {
    const env = await envFor("/users", { method: "POST", body: '{"name":"dean"}' });

    expect(env.REQUEST_METHOD).toBe("POST");
    const input = env["rack.input"] as StringIO;
    expect(typeof input.read).toBe("function");
    expect(input.read()).toBe('{"name":"dean"}');
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
  });

  it("sets the CGI meta variables WEBrick supplies", async () => {
    const env = await envFor("/users?page=2");

    expect(env.GATEWAY_INTERFACE).toBe("CGI/1.1");
    expect(env.SCRIPT_NAME).toBe("");
    expect(env.REQUEST_URI).toBe("/users?page=2");
    expect(env.REQUEST_PATH).toBe("/users");
    expect(env.SERVER_PROTOCOL).toBe("HTTP/1.1");
    expect(env.REMOTE_ADDR).toBe("127.0.0.1");
    expect(env.REMOTE_HOST).toBe("127.0.0.1");
    expect(env).not.toHaveProperty("REMOTE_USER");
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
