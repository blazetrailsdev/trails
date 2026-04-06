import { describe, it, expect } from "vitest";
import { createAppServer } from "./app-server.js";
import { ActionController } from "@blazetrails/actionpack";
import { bodyToString } from "@blazetrails/rack";
import type { RackEnv } from "@blazetrails/rack";

function makeEnv(method: string, path: string): RackEnv {
  const qIdx = path.indexOf("?");
  return {
    REQUEST_METHOD: method.toUpperCase(),
    PATH_INFO: qIdx >= 0 ? path.slice(0, qIdx) : path,
    QUERY_STRING: qIdx >= 0 ? path.slice(qIdx + 1) : "",
    SERVER_NAME: "localhost",
    SERVER_PORT: "3000",
    "rack.url_scheme": "http",
    "rack.input": { read: () => "" },
  };
}

describe("createAppServer", () => {
  it("returns 404 for unmatched routes", async () => {
    const server = createAppServer({ executeCode: async () => {} });
    const [status, _headers, body] = await server.call(makeEnv("GET", "/nothing"));
    expect(status).toBe(404);
    const text = await bodyToString(body);
    expect(text).toContain("No route matches");
  });

  it("dispatches to a registered controller", async () => {
    const server = createAppServer({ executeCode: async () => {} });

    class PostsController extends ActionController.Base {
      async index() {
        this.response.body = '{"posts":[]}';
        this.response.status = 200;
        this.response.setHeader("content-type", "application/json");
      }
    }

    server.registerController("posts", PostsController);
    server.drawRoutes((r: any) => {
      r.resources("posts");
    });

    const [status, headers, body] = await server.call(makeEnv("GET", "/posts"));
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("application/json");
    const text = await bodyToString(body);
    expect(text).toBe('{"posts":[]}');
  });

  it("returns 404 for unregistered controller", async () => {
    const server = createAppServer({ executeCode: async () => {} });
    server.drawRoutes((r: any) => {
      r.resources("users");
    });

    const [status, _headers, body] = await server.call(makeEnv("GET", "/users"));
    expect(status).toBe(404);
    const text = await bodyToString(body);
    expect(text).toContain("Controller not found");
  });

  it("returns 500 when controller throws", async () => {
    const server = createAppServer({ executeCode: async () => {} });

    class BrokenController extends ActionController.Base {
      async index() {
        throw new Error("kaboom");
      }
    }

    server.registerController("broken", BrokenController);
    server.drawRoutes((r: any) => {
      r.get("/broken", "broken#index");
    });

    const [status, _headers, body] = await server.call(makeEnv("GET", "/broken"));
    expect(status).toBe(500);
    const text = await bodyToString(body);
    expect(text).toContain("kaboom");
  });
});
