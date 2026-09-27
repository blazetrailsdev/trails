import { describe, it, expect } from "vitest";
import { RouteSet } from "./route-set.js";

describe("RouteSet — Journey bridge", () => {
  it("journeyRecognize resolves a simple GET route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });
    const m = routes.recognize("GET", "/posts");
    expect(m).not.toBeNull();
    expect(m!.route.defaults.controller).toBe("posts");
    expect(m!.route.defaults.action).toBe("index");
  });

  it("journeyRecognize captures dynamic segments", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognize("GET", "/posts/42");
    expect(m).not.toBeNull();
    expect(m!.params["id"]).toBe("42");
    expect(m!.route.defaults.controller).toBe("posts");
  });

  it("journeyRecognize filters by HTTP verb", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/x", { to: "a#index" });
      r.post("/x", { to: "b#create" });
    });
    expect(routes.recognize("GET", "/x")!.route.defaults.action).toBe("index");
    expect(routes.recognize("POST", "/x")!.route.defaults.action).toBe("create");
  });

  it("journeyRecognize returns null for unmatched paths", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });
    expect(routes.recognize("GET", "/nope")).toBeNull();
  });

  it("journeyRecognize honors regex constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
    });
    expect(routes.recognize("GET", "/posts/42")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/abc")).toBeNull();
  });

  it("journeyRecognize preserves escaped \\$ in constraints (only strips true anchors)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\$\d+/ } });
    });
    expect(routes.recognize("GET", "/posts/$5")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/abc")).toBeNull();
  });

  it("journeyRecognize URI-decodes captured parameters", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:slug", { to: "posts#show" });
    });
    const m = routes.recognize("GET", "/posts/hello%20world");
    expect(m!.params["slug"]).toBe("hello world");
  });

  it("journeyRecognize keeps :controller/:action captures for generic routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/:controller/:action", {});
    });
    const m = routes.recognize("GET", "/users/show");
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({ controller: "users", action: "show" });
  });

  it("journeyRecognize does not leak defaults into missing optional captures", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts(/:id)", { to: "posts#index", defaults: { id: "1" } });
    });
    const m = routes.recognize("GET", "/posts");
    expect(m).not.toBeNull();
    expect(m!.params).not.toHaveProperty("id");
  });

  it("journeyRecognize normalizes paths (leading slash, trailing slash)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });
    expect(routes.recognize("GET", "/posts/")).not.toBeNull();
    expect(routes.recognize("GET", "posts")).not.toBeNull();
  });

  it("journeyRecognize params hold only path captures (defaults stripped)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognize("GET", "/posts/1")!;
    expect(m.params).toEqual({ id: "1" });
    expect(m.params).not.toHaveProperty("controller");
    expect(m.params).not.toHaveProperty("action");
  });
});
