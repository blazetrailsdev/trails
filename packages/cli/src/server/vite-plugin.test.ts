import { describe, it, expect, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { trailsPlugin, buildRackEnv } from "./vite-plugin.js";
import * as applicationModule from "./application.js";

function createMockReq(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options.method || "GET";
  req.url = options.url || "/";
  req.headers = {
    host: "localhost:3000",
    ...options.headers,
  };

  process.nextTick(() => {
    if (options.body) {
      req.push(Buffer.from(options.body));
    }
    req.push(null);
  });

  return req;
}

describe("trailsPlugin", () => {
  it("creates a plugin with name 'trails' and enforce 'post'", () => {
    const plugin = trailsPlugin();
    expect(plugin.name).toBe("trails");
    expect(plugin.enforce).toBe("post");
  });

  it("registers middleware via configureServer", async () => {
    const initSpy = vi
      .spyOn(applicationModule.Application.prototype, "initialize")
      .mockResolvedValue();

    try {
      const plugin = trailsPlugin({ cwd: "/nonexistent" });
      const middlewares: any[] = [];
      const fakeServer = {
        config: { server: { port: 3000 } },
        httpServer: null,
        middlewares: { use: (fn: any) => middlewares.push(fn) },
      };

      const registerFn = await (plugin as any).configureServer(fakeServer);
      expect(typeof registerFn).toBe("function");
      registerFn();
      expect(middlewares.length).toBe(1);
    } finally {
      initSpy.mockRestore();
    }
  });

  it("calls next(err) when app.call throws", async () => {
    const thrownError = new Error("boom");
    const callSpy = vi
      .spyOn(applicationModule.Application.prototype, "call")
      .mockRejectedValue(thrownError);
    const initSpy = vi
      .spyOn(applicationModule.Application.prototype, "initialize")
      .mockResolvedValue();

    try {
      const plugin = trailsPlugin({ cwd: "/test-error-path" });
      const middlewares: any[] = [];
      const fakeServer = {
        config: { server: { port: 3000 } },
        httpServer: { address: () => ({ port: 3000 }) },
        middlewares: { use: (fn: any) => middlewares.push(fn) },
      };

      const registerFn = await (plugin as any).configureServer(fakeServer);
      registerFn();

      const req = createMockReq({ url: "/explode" });
      const socket = new Socket();
      const res = new ServerResponse(new IncomingMessage(socket));
      res.writeHead = vi.fn().mockReturnValue(res);
      res.end = vi.fn().mockReturnValue(res);
      const next = vi.fn();

      await middlewares[0](req, res, next);

      expect(next).toHaveBeenCalledWith(thrownError);
      expect(res.writeHead).not.toHaveBeenCalled();
    } finally {
      callSpy.mockRestore();
      initSpy.mockRestore();
    }
  });

  it("propagates body-too-large error via next()", async () => {
    const initSpy = vi
      .spyOn(applicationModule.Application.prototype, "initialize")
      .mockResolvedValue();

    try {
      const plugin = trailsPlugin({ cwd: "/test-large-body" });
      const middlewares: any[] = [];
      const fakeServer = {
        config: { server: { port: 3000 } },
        httpServer: { address: () => ({ port: 3000 }) },
        middlewares: { use: (fn: any) => middlewares.push(fn) },
      };

      const registerFn = await (plugin as any).configureServer(fakeServer);
      registerFn();

      // Create a request that streams > 10 MB
      const socket = new Socket();
      const req = new IncomingMessage(socket);
      req.method = "POST";
      req.url = "/upload";
      req.headers = { host: "localhost:3000" };

      const res = new ServerResponse(new IncomingMessage(new Socket()));
      res.writeHead = vi.fn().mockReturnValue(res);
      res.end = vi.fn().mockReturnValue(res);
      const next = vi.fn();

      // Push chunks that exceed the 10 MB limit
      const chunk = Buffer.alloc(1024 * 1024); // 1 MB
      process.nextTick(() => {
        for (let i = 0; i < 11; i++) {
          req.push(chunk);
        }
        req.push(null);
      });

      await middlewares[0](req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("too large");
    } finally {
      initSpy.mockRestore();
    }
  });
});

describe("buildRackEnv", () => {
  it("builds a Rack env from a basic GET request", async () => {
    const req = createMockReq({ method: "GET", url: "/users?page=2" });
    const env = await buildRackEnv(req, 3000);

    expect(env.REQUEST_METHOD).toBe("GET");
    expect(env.PATH_INFO).toBe("/users");
    expect(env.QUERY_STRING).toBe("page=2");
    expect(env.SERVER_PORT).toBe("3000");
    expect(env.HTTP_HOST).toBe("localhost:3000");
    expect(env["rack.url_scheme"]).toBe("http");
  });

  it("reads request body", async () => {
    const req = createMockReq({ method: "POST", url: "/users", body: '{"name":"dean"}' });
    const env = await buildRackEnv(req, 3000);

    expect(env.REQUEST_METHOD).toBe("POST");
    expect(env["rack.input"]).toBe('{"name":"dean"}');
  });

  it("maps content-type and content-length to CGI keys", async () => {
    const req = createMockReq({
      headers: {
        "content-type": "application/json",
        "content-length": "15",
      },
    });
    const env = await buildRackEnv(req, 3000);

    expect(env.CONTENT_TYPE).toBe("application/json");
    expect(env.CONTENT_LENGTH).toBe("15");
  });

  it("maps other headers to HTTP_ prefixed keys", async () => {
    const req = createMockReq({
      headers: { "x-request-id": "abc-123", accept: "text/html" },
    });
    const env = await buildRackEnv(req, 3000);

    expect(env.HTTP_X_REQUEST_ID).toBe("abc-123");
    expect(env.HTTP_ACCEPT).toBe("text/html");
  });

  it("normalizes array header values to comma-separated strings", async () => {
    const req = createMockReq({
      headers: { "set-cookie": ["a=1", "b=2"] as any },
    });
    const env = await buildRackEnv(req, 3000);

    expect(env.HTTP_SET_COOKIE).toBe("a=1, b=2");
  });

  it("skips undefined header values", async () => {
    const req = createMockReq({});
    req.headers["x-undefined"] = undefined as any;
    const env = await buildRackEnv(req, 3000);

    expect(env).not.toHaveProperty("HTTP_X_UNDEFINED");
  });

  it("sets rack.url_scheme to https when x-forwarded-proto is https", async () => {
    const req = createMockReq({
      headers: { "x-forwarded-proto": "https" },
    });
    const env = await buildRackEnv(req, 3000);

    expect(env["rack.url_scheme"]).toBe("https");
  });

  it("sets rack.url_scheme to https for TLS sockets", async () => {
    const req = createMockReq({});
    (req.socket as any).encrypted = true;
    const env = await buildRackEnv(req, 3000);

    expect(env["rack.url_scheme"]).toBe("https");
  });

  it("handles comma-separated x-forwarded-proto", async () => {
    const req = createMockReq({
      headers: { "x-forwarded-proto": "https, http" },
    });
    const env = await buildRackEnv(req, 3000);

    expect(env["rack.url_scheme"]).toBe("https");
  });
});
