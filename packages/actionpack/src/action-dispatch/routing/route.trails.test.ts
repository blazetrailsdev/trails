import { describe, it, expect } from "vitest";
import { Route } from "./route.js";

describe("ActionDispatch::Routing::Route", () => {
  it("initialize", () => {
    const route = new Route("GET", "/:controller/:action/:id", "pages", "show", {
      name: "name",
    });
    expect(route.verb).toBe("GET");
    expect(route.path).toBe("/:controller/:action/:id");
    expect(route.name).toBe("name");
  });

  it("path requirements override defaults", () => {
    const route = new Route("GET", "/:name", "pages", "show", {
      constraints: { name: /love/ },
    });
    expect(route.match("GET", "/love")).not.toBeNull();
    expect(route.match("GET", "/tender")).toBeNull();
  });

  it("format with star", () => {
    const route = new Route("GET", "/posts/:id", "posts", "show");
    expect(route.pathFor({ id: "42" })).toBe("/posts/42");
  });

  it("connects all match", () => {
    const route = new Route("GET", "/:controller/:action/:id", "foo", "bar", {
      constraints: { action: "bar" },
    });
    const m = route.match("GET", "/foo/bar/10");
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({ controller: "foo", action: "bar", id: "10" });
  });

  it("extras are not included if optional", () => {
    const route = new Route("GET", "/page/:id", "pages", "show");
    expect(route.pathFor({ id: 10 })).toBe("/page/10");
  });

  it("extras are not included if optional with parameter", () => {
    const route = new Route("GET", "/page(/:id)", "pages", "show");
    expect(route.pathFor({ id: "10" })).toBe("/page/10");
    expect(route.pathFor({})).toBe("/page");
  });

  it("extras are not included if optional parameter is nil", () => {
    const route = new Route("GET", "/page(/:id)", "pages", "show");
    expect(route.pathFor({})).toBe("/page");
  });

  it("score", () => {
    const r1 = new Route("GET", "/posts/:id", "posts", "show");
    const r2 = new Route("GET", "/posts/featured", "posts", "featured");
    expect(r2.score()).toBeGreaterThan(r1.score());
  });

  it("route adds itself as memo", () => {
    const route = new Route("GET", "/posts/:id", "posts", "show", { name: "post" });
    const m = route.match("GET", "/posts/1");
    expect(m!.route).toBe(route);
  });

  it("ip address", () => {
    const route = new Route("GET", "/posts", "posts", "index", {
      ip: /192\.168\.1\.\d+/,
    });
    expect(route.ip).toEqual(/192\.168\.1\.\d+/);
  });

  it("default ip", () => {
    const route = new Route("GET", "/posts", "posts", "index");
    expect(route.ip).toEqual(/(?:)/);
  });

  it("a route built from a multi-verb via answers every listed verb", () => {
    const route = new Route(["GET", "POST"], "/search", "search", "index");
    expect(route.verb).toBe("GET|POST");
    expect(route.match("GET", "/search")).not.toBeNull();
    expect(route.match("POST", "/search")).not.toBeNull();
    expect(route.match("DELETE", "/search")).toBeNull();
  });

  it("a permissive constraint does not make an absent required key present", () => {
    const route = new Route("GET", "/posts/:id", "posts", "show", {
      constraints: { id: /.*/ },
    });
    expect(() => route.pathFor({})).toThrow(/missing required keys: \[:id\]/);
  });
});
