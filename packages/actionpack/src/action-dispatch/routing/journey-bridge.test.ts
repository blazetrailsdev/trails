import { describe, it, expect } from "vitest";
import { RouteSet } from "./route-set.js";

describe("RouteSet — Journey bridge", () => {
  it("journeyRecognize resolves a simple GET route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });
    const m = routes.journeyRecognize("GET", "/posts");
    expect(m).not.toBeNull();
    expect(m!.route.controller).toBe("posts");
    expect(m!.route.action).toBe("index");
  });

  it("journeyRecognize captures dynamic segments", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.journeyRecognize("GET", "/posts/42");
    expect(m).not.toBeNull();
    expect(m!.params["id"]).toBe("42");
    expect(m!.route.controller).toBe("posts");
  });

  it("journeyRecognize filters by HTTP verb", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/x", { to: "a#index" });
      r.post("/x", { to: "b#create" });
    });
    expect(routes.journeyRecognize("GET", "/x")!.route.action).toBe("index");
    expect(routes.journeyRecognize("POST", "/x")!.route.action).toBe("create");
  });

  it("journeyRecognize returns null for unmatched paths", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });
    expect(routes.journeyRecognize("GET", "/nope")).toBeNull();
  });

  it("journeyRouter cache invalidates on draw and clear", () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/a", { to: "a#index" }));
    const first = routes.journeyRouter;
    routes.draw((r) => r.get("/b", { to: "b#index" }));
    expect(routes.journeyRouter).not.toBe(first);
    routes.clear();
    expect(routes.journeyRouter).not.toBe(first);
  });

  it("journeyRecognize honors regex constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
    });
    expect(routes.journeyRecognize("GET", "/posts/42")).not.toBeNull();
    expect(routes.journeyRecognize("GET", "/posts/abc")).toBeNull();
  });

  it("journeyRecognize honors anchored regex constraints (^/$ stripped)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /^\d+$/ } });
    });
    const m = routes.journeyRecognize("GET", "/posts/7");
    expect(m).not.toBeNull();
    expect(m!.params["id"]).toBe("7");
    expect(routes.journeyRecognize("GET", "/posts/abc")).toBeNull();
  });

  it("journeyRecognize honors string constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: "\\d+" } });
    });
    expect(routes.journeyRecognize("GET", "/posts/9")).not.toBeNull();
    expect(routes.journeyRecognize("GET", "/posts/x")).toBeNull();
  });

  it("journeyRecognize preserves escaped \\$ in constraints (only strips true anchors)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      // Constraint matches a literal `$` followed by digits.
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\$\d+/ } });
    });
    expect(routes.journeyRecognize("GET", "/posts/$5")).not.toBeNull();
    expect(routes.journeyRecognize("GET", "/posts/abc")).toBeNull();
  });

  it("journeyRecognize strips anchors from string constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: "^\\d+$" } });
    });
    expect(routes.journeyRecognize("GET", "/posts/9")).not.toBeNull();
  });

  it("journeyRecognize URI-decodes captured parameters", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:slug", { to: "posts#show" });
    });
    const m = routes.journeyRecognize("GET", "/posts/hello%20world");
    expect(m!.params["slug"]).toBe("hello world");
  });

  it("journeyRecognize keeps :controller/:action captures for generic routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/:controller/:action", {});
    });
    const m = routes.journeyRecognize("GET", "/users/show");
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({ controller: "users", action: "show" });
  });

  it("journeyRecognize does not leak defaults into missing optional captures", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts(/:id)", { to: "posts#index", defaults: { id: "1" } });
    });
    const m = routes.journeyRecognize("GET", "/posts");
    expect(m).not.toBeNull();
    expect(m!.params).not.toHaveProperty("id");
  });

  it("journeyRecognize normalizes paths (leading slash, trailing slash)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });
    expect(routes.journeyRecognize("GET", "/posts/")).not.toBeNull();
    expect(routes.journeyRecognize("GET", "posts")).not.toBeNull();
  });

  it("journeyRecognize params hold only path captures (defaults stripped)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.journeyRecognize("GET", "/posts/1")!;
    expect(m.params).toEqual({ id: "1" });
    expect(m.params).not.toHaveProperty("controller");
    expect(m.params).not.toHaveProperty("action");
  });
});
