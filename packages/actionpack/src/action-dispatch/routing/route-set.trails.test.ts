import { describe, it, expect } from "vitest";
import { RouteSet } from "./route-set.js";

describe("ActionDispatch::Routing::RouteSet generation", () => {
  it("trims a trailing part that restates the route default", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts(/:page)", { to: "posts#index", as: "posts", defaults: { page: "1" } });
    });
    expect(routes.generate("posts", { page: "1" })).toBe("/posts");
    expect(routes.generate("posts", { page: "2" })).toBe("/posts/2");
  });

  it("never trims a required part that restates the route default", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:page", { to: "posts#index", as: "posts", defaults: { page: "1" } });
    });
    expect(routes.generate("posts", { page: "1" })).toBe("/posts/1");
  });

  it("keeps a trailing part named only by the enclosing scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope({ page: "1" }, (m) => {
        m.get("/posts(/:page)", { to: "posts#index", as: "posts" });
      });
    });
    expect(routes.generate("posts", {}, { page: "3" })).toBe("/posts/3");
  });
});
