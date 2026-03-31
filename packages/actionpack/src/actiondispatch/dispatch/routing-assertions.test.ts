import { describe, it, expect } from "vitest";
import { RouteSet } from "../routing/route-set.js";

// ==========================================================================
// dispatch/routing_assertions_test.rb
// ==========================================================================
describe("ActionDispatch::Routing::Assertions", () => {
  it("assert generates", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor("post", { id: 1 })).toBe("/posts/1");
  });

  it("assert recognizes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognize("GET", "/posts/1");
    expect(m).not.toBeNull();
    expect(m!.route.controller).toBe("posts");
    expect(m!.route.action).toBe("show");
    expect(m!.params.id).toBe("1");
  });

  it("assert routing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor("post", { id: 1 })).toBe("/posts/1");
    const m = routes.recognize("GET", "/posts/1");
    expect(m!.route.controller).toBe("posts");
  });

  it("with routing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/temp", { to: "temp#index", as: "temp" });
    });
    expect(routes.pathFor("temp")).toBe("/temp");
    routes.clear();
    expect(() => routes.pathFor("temp")).toThrow();
  });
});
