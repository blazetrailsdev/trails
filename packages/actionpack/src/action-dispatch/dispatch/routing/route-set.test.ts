import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  assertEqual,
  assertNil,
  assertNot,
  assertPredicate,
  assertRaises,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { MockRequest } from "@blazetrails/rack";
import { controllerConstants } from "../../http/request.js";
import type { DispatchableControllerClass } from "../../routing/dispatcher.js";
import { RouteSet, type DrawCallback } from "../../routing/route-set.js";

class StubController {
  static actionEncodingTemplate(): null {
    return null;
  }
}

beforeAll(() => {
  for (const name of ["posts", "late", "seed"]) {
    controllerConstants.set(name, StubController as unknown as DispatchableControllerClass);
  }
});

describe("RouteSetTest", () => {
  class SimpleApp {
    readonly response: string;

    constructor(response: string) {
      this.response = response;
    }

    call(_env: unknown): [number, Record<string, string>, string[]] {
      return [200, { "Content-Type": "text/plain" }, [this.response]];
    }
  }

  let set: RouteSet;
  beforeEach(() => {
    set = new RouteSet();
  });

  const draw = (block: DrawCallback): void => {
    set.draw(block);
  };
  const urlHelpers = (): Record<string, (...args: unknown[]) => string> =>
    set.urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;
  const isEmpty = (): boolean => set.isEmpty();

  it("not being empty when route is added", () => {
    assertPredicate(set, (set) => set.isEmpty());

    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
    });

    assertNot(isEmpty());
  });

  it("URL helpers are added when route is added", async () => {
    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
    });

    assertEqual("/foo", urlHelpers().fooPath());
    await assertRaises([TypeError], {}, () => {
      urlHelpers().barPath();
    });

    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
      this.get("bar", { to: new SimpleApp("bar#index") });
    });

    assertEqual("/foo", urlHelpers().fooPath());
    assertEqual("/bar", urlHelpers().barPath());
  });

  it("URL helpers are updated when route is updated", () => {
    draw(function () {
      this.get("bar", { to: new SimpleApp("bar#index"), as: "bar" });
    });

    assertEqual("/bar", urlHelpers().barPath());

    draw(function () {
      this.get("baz", { to: new SimpleApp("baz#index"), as: "bar" });
    });

    assertEqual("/baz", urlHelpers().barPath());
  });

  it("URL helpers are removed when route is removed", async () => {
    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
      this.get("bar", { to: new SimpleApp("bar#index") });
    });

    assertEqual("/foo", urlHelpers().fooPath());
    assertEqual("/bar", urlHelpers().barPath());

    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
    });

    assertEqual("/foo", urlHelpers().fooPath());
    await assertRaises([TypeError], {}, () => {
      urlHelpers().barPath();
    });
  });

  it("only_path: true with *_url and no :host option", () => {
    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
    });

    assertEqual("/foo", urlHelpers().fooUrl({ onlyPath: true }));
  });

  it("only_path: false with *_url and no :host option", async () => {
    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
    });

    await assertRaises([ArgumentError], {}, () => {
      urlHelpers().fooUrl({ onlyPath: false });
    });
  });

  it("only_path: false with *_url and local :host option", () => {
    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
    });

    assertEqual(
      "http://example.com/foo",
      urlHelpers().fooUrl({ onlyPath: false, host: "example.com" }),
    );
  });

  it("only_path: false with *_url and global :host option", () => {
    set.defaultUrlOptions = { host: "example.com" };

    draw(function () {
      this.get("foo", { to: new SimpleApp("foo#index") });
    });

    assertEqual("http://example.com/foo", urlHelpers().fooUrl({ onlyPath: false }));
  });

  it("explicit keys win over implicit keys", () => {
    draw(function () {
      this.resources("foo", () => {
        this.resources("bar", { to: new SimpleApp("foo#show") });
      });
    });

    assertEqual("/foo/1/bar/2", urlHelpers().fooBarPath(1, 2));
    assertEqual("/foo/1/bar/2", urlHelpers().fooBarPath(2, { foo_id: 1 }));
  });

  it("having an optional scope with resources", () => {
    draw(function () {
      this.scope("(/:foo)", () => {
        this.resources("users");
      });
    });

    assertEqual("/users/1", urlHelpers().userPath(1));
    assertEqual("/users/1", urlHelpers().userPath(1, { foo: null }));
    assertEqual("/a/users/1", urlHelpers().userPath(1, { foo: "a" }));
  });

  it("implicit path components consistently return the same result", () => {
    draw(function () {
      this.resources("users", { to: new SimpleApp("foo#index") });
    });
    assertEqual("/users/1.json", urlHelpers().userPath(1, "json"));
    assertEqual("/users/1.json", urlHelpers().userPath(1, { format: "json" }));
    assertEqual("/users/1.json", urlHelpers().userPath(1, "json"));
  });

  it("escape new line for dynamic params", () => {
    draw(function () {
      this.get("/dynamic/:dynamic_segment", { to: new SimpleApp("foo#index"), as: "dynamic" });
    });

    assertEqual(
      "/dynamic/a%0Anewline",
      urlHelpers().dynamicPath({ dynamic_segment: "a\nnewline" }),
    );
  });

  it("escape new line for wildcard params", () => {
    draw(function () {
      this.get("/wildcard/*wildcard_segment", { to: new SimpleApp("foo#index"), as: "wildcard" });
    });

    assertEqual(
      "/wildcard/a%0Anewline",
      urlHelpers().wildcardPath({ wildcard_segment: "a\nnewline" }),
    );
  });

  it("find a route for the given requirements", () => {
    draw(function () {
      this.resources("foo");
      this.resources("bar");
    });

    const route = set.fromRequirements({ controller: "bar", action: "index" });

    assertEqual("bar_index", route!.name);
  });

  it("find a route for the given requirements returns nil for no match", () => {
    draw(function () {
      this.resources("foo");
      this.resources("bar");
    });

    const route = set.fromRequirements({ controller: "baz", action: "index" });

    assertNil(route);
  });

  it("isEmpty and clearBang", () => {
    const routes = new RouteSet();
    expect(routes.isEmpty()).toBe(true);
    routes.draw(function () {
      this.get("/x", { to: "x#i", as: "x" });
    });
    expect(routes.isEmpty()).toBe(false);
    routes.clearBang();
    expect(routes.isEmpty()).toBe(true);
    expect(routes.namedRoutes.routes.has("x")).toBe(false);
  });

  it("append/finalizeBang and prepend/clearBang", () => {
    const routes = new RouteSet();
    routes.append(function () {
      this.get("/late", { to: "late#i" });
    });
    routes.finalizeBang();
    expect(routes.recognizePath("/late")).toEqual({ controller: "late", action: "i" });
    routes.prepend(function () {
      this.get("/seed", { to: "seed#i" });
    });
    routes.clearBang();
    expect(routes.recognizePath("/seed")).toEqual({ controller: "seed", action: "i" });
  });

  it("addRoute rejects invalid names", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw(function () {
        this.get("/x", { to: "x#i", as: "9bad" });
      }),
    ).toThrow(/Invalid route name/);
  });

  it("recognizePathWithRequest merges defaults+params+extras and raise/no-raise", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show" });
    });
    expect(
      routes.recognizePathWithRequest(
        routes.makeRequest(MockRequest.envFor("/posts/42")),
        "/posts/42",
        { from: "test" },
      ),
    ).toMatchObject({ controller: "posts", action: "show", id: "42", from: "test" });
    expect(() =>
      routes.recognizePathWithRequest(routes.makeRequest(MockRequest.envFor("/nope")), "/nope", {}),
    ).toThrow(/No route matches/);
    expect(
      routes.recognizePathWithRequest(
        routes.makeRequest(MockRequest.envFor("/nope")),
        "/nope",
        {},
        { raiseOnMissing: false },
      ),
    ).toBeUndefined();
  });

  it("findScriptName, isOptimizeRoutesGeneration, extraKeys", () => {
    const routes = new RouteSet();
    const opts: Record<string, unknown> = { scriptName: "/app", x: 1 };
    expect(routes.findScriptName(opts)).toBe("/app");
    expect(opts).toEqual({ x: 1 });
    expect(routes.isOptimizeRoutesGeneration()).toBe(true);
    routes.setDefaultUrlOptions({ host: "ex.com" });
    expect(routes.isOptimizeRoutesGeneration()).toBe(false);
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.extraKeys({ controller: "posts", action: "show", id: 1, page: 2 })).toEqual([
      "page",
    ]);
  });
});
