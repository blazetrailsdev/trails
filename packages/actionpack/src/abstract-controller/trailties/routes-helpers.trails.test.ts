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
});
