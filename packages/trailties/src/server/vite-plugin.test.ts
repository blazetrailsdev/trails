import { describe, it, expect, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { bodyFromString } from "@blazetrails/rack";
import type { RackApp } from "@blazetrails/actionpack";
import { trailsPlugin } from "./vite-plugin.js";

const okApp: RackApp = async () => [200, { "content-type": "text/plain" }, bodyFromString("ok")];

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
    const plugin = trailsPlugin({ app: okApp });
    expect(plugin.name).toBe("trails");
    expect(plugin.enforce).toBe("post");
  });

  it("registers middleware via configureServer", async () => {
    const plugin = trailsPlugin({ app: okApp });
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
  });

  it("calls next(err) when app.call throws", async () => {
    const thrownError = new Error("boom");
    const explodingApp: RackApp = () => Promise.reject(thrownError);

    {
      const plugin = trailsPlugin({ app: explodingApp });
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
    }
  });

  it("propagates body-too-large error via next()", async () => {
    {
      const plugin = trailsPlugin({ app: okApp });
      const middlewares: any[] = [];
      const fakeServer = {
        config: { server: { port: 3000 } },
        httpServer: { address: () => ({ port: 3000 }) },
        middlewares: { use: (fn: any) => middlewares.push(fn) },
      };

      const registerFn = await (plugin as any).configureServer(fakeServer);
      registerFn();

      const socket = new Socket();
      const req = new IncomingMessage(socket);
      req.method = "POST";
      req.url = "/upload";
      req.headers = { host: "localhost:3000" };

      const res = new ServerResponse(new IncomingMessage(new Socket()));
      res.writeHead = vi.fn().mockReturnValue(res);
      res.end = vi.fn().mockReturnValue(res);
      const next = vi.fn();

      const chunk = Buffer.alloc(1024 * 1024);
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
    }
  });
});
