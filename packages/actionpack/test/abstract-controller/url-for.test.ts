import { describe, it, expect } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { include } from "@blazetrails/activesupport";
import { Base } from "../../lib/abstract-controller/base.js";
import { UrlFor, type RouteSetLike } from "../../lib/abstract-controller/url-for.js";

describe("AbstractController::UrlFor", () => {
  it("_routes raises until routing helpers are included", () => {
    class Host extends Base {}
    include(Host, UrlFor);
    const host = new Host() as unknown as { readonly _routes: never };
    expect(() => host._routes).toThrow(RuntimeError);
    expect(() => host._routes).toThrow(/you must include routing helpers explicitly/);
  });

  it("action_methods drops route helper names", () => {
    class Abstract extends Base {}
    include(Abstract, UrlFor);
    Abstract.abstractBang();
    class Host extends Abstract {
      show() {}
      index() {}
    }
    const routes: RouteSetLike = { namedRoutes: { helperNames: () => ["posts_url", "show"] } };
    Object.defineProperty(Host, "_routes", { get: () => routes });
    expect([...Host.actionMethods()].sort()).toEqual(["index"]);
  });

  it("action_methods is the super list with no route set", () => {
    class Abstract extends Base {}
    include(Abstract, UrlFor);
    Abstract.abstractBang();
    class Host extends Abstract {
      show() {}
    }
    expect([...Host.actionMethods()]).toEqual(["show"]);
  });

  it("memoizes action_methods per class", () => {
    class Abstract extends Base {}
    include(Abstract, UrlFor);
    Abstract.abstractBang();
    class Host extends Abstract {
      show() {}
    }
    expect(Host.actionMethods()).toBe(Host.actionMethods());
  });
});
