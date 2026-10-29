import { describe, expect, it } from "vitest";

import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { RoutesHelpers, type RoutesHelpersControllerClass } from "./routes-helpers.js";

describe("RoutesHelpers.with (trails)", () => {
  it("a later include outranks an earlier one", () => {
    const cls = class {};
    const wired = cls as unknown as RoutesHelpersControllerClass;
    RoutesHelpers.with({ urlHelpers: () => ({ rootPath: () => "/a" }) })(wired);
    RoutesHelpers.with({ urlHelpers: () => ({ rootPath: () => "/b" }) })(wired);
    expect((new cls() as unknown as { rootPath(): string }).rootPath()).toBe("/b");
  });

  it("a route drawn later does not replace a method the class defined after the include", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("posts", { to: "posts#index", as: "posts" });
    });
    const cls = class {};
    RoutesHelpers.with(routes)(cls as unknown as RoutesHelpersControllerClass);
    Object.defineProperty(cls.prototype, "postsPath", {
      value: () => "mine",
      writable: true,
      configurable: true,
    });
    routes.draw(function () {
      this.get("posts", { to: "posts#index", as: "posts" });
    });
    expect((new cls() as unknown as { postsPath(): string }).postsPath()).toBe("mine");
  });

  it("a redraw of an earlier route set does not replace a later one's helper", () => {
    const draw = (routes: RouteSet, to: string): void =>
      routes.draw(function () {
        this.get(to, { to: `${to}#index`, as: "posts" });
      });
    const a = new RouteSet();
    const b = new RouteSet();
    draw(a, "a");
    draw(b, "b");
    const cls = class {};
    const wired = cls as unknown as RoutesHelpersControllerClass;
    RoutesHelpers.with(a)(wired);
    RoutesHelpers.with(b)(wired);
    const own = Object.getOwnPropertyDescriptor(cls.prototype, "postsPath")!.value;
    draw(a, "a2");
    expect(Object.getOwnPropertyDescriptor(cls.prototype, "postsPath")!.value).toBe(own);
    a.namedRoutes.clear();
    expect(Object.getOwnPropertyDescriptor(cls.prototype, "postsPath")!.value).toBe(own);
  });

  it("clearing a later route set falls back to an earlier one's helper", () => {
    const a = new RouteSet();
    const b = new RouteSet();
    for (const routes of [a, b]) {
      routes.draw(function () {
        this.get("posts", { to: "posts#index", as: "posts" });
      });
    }
    const cls = class {};
    const wired = cls as unknown as RoutesHelpersControllerClass;
    RoutesHelpers.with(a)(wired);
    const fromA = Object.getOwnPropertyDescriptor(cls.prototype, "postsPath")!.value;
    RoutesHelpers.with(b)(wired);
    b.namedRoutes.clear();
    expect(Object.getOwnPropertyDescriptor(cls.prototype, "postsPath")!.value).toBe(fromA);
  });

  it("a route drawn in a later include outranks an earlier include's helper", () => {
    const earlier = new RouteSet();
    const later = new RouteSet();
    earlier.draw(function () {
      this.get("posts", { to: "posts#index", as: "posts" });
    });
    const cls = class {
      defaultUrlOptions = {};
    };
    const wired = cls as unknown as RoutesHelpersControllerClass;
    RoutesHelpers.with(earlier)(wired);
    RoutesHelpers.with(later)(wired);
    later.draw(function () {
      this.get("later_posts", { to: "posts#index", as: "posts" });
    });
    expect((new cls() as unknown as { postsPath(): string }).postsPath()).toBe("/later_posts");
  });

  it("clearing a later include restores the earlier include's redrawn helper", () => {
    const earlier = new RouteSet();
    const later = new RouteSet();
    for (const routes of [earlier, later]) {
      routes.draw(function () {
        this.get("posts", { to: "posts#index", as: "posts" });
      });
    }
    const cls = class {
      defaultUrlOptions = {};
    };
    const wired = cls as unknown as RoutesHelpersControllerClass;
    RoutesHelpers.with(earlier)(wired);
    RoutesHelpers.with(later)(wired);
    earlier.draw(function () {
      this.get("redrawn", { to: "posts#index", as: "posts" });
    });
    later.namedRoutes.clear();
    expect((new cls() as unknown as { postsPath(): string }).postsPath()).toBe("/redrawn");
  });

  it("splices nothing into the class's prototype chain", () => {
    const parent = class {};
    const cls = class extends parent {};
    RoutesHelpers.with(new RouteSet())(cls as unknown as RoutesHelpersControllerClass);
    expect(Object.getPrototypeOf(cls.prototype)).toBe(parent.prototype);
  });

  it("copies a namespaced module's helpers, which no route set records", () => {
    const cls = class {};
    const wired = cls as unknown as RoutesHelpersControllerClass;
    wired.trailtieRoutesUrlHelpers = () => ({ enginePath: () => "/engine" });
    RoutesHelpers.with(new RouteSet())(wired);
    expect((new cls() as unknown as { enginePath(): string }).enginePath()).toBe("/engine");
  });
});
