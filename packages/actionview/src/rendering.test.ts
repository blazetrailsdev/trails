import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { DetailsKey } from "./lookup-context.js";
import { Template } from "./template.js";
import { TemplateHandlers } from "./template/handlers.js";
import { Tse } from "./template/handlers/tse.js";
import {
  buildViewContextClass,
  inheritViewContextClassQ,
  viewContextClass,
  type ViewContextRoutes,
} from "./rendering.js";

/** A stand-in for the controller class Rails mixes `Rendering::ClassMethods` into. */
class Controller {
  static _routes: ViewContextRoutes | null = null;
  static _helpers: object | null = null;
  static supportsPathQ(): boolean {
    return true;
  }
  static inheritViewContextClassQ = inheritViewContextClassQ;
  static buildViewContextClass = buildViewContextClass;
  static viewContextClass = viewContextClass;
  static _viewContextClass?: typeof Base;
}

const routesWith = (helpers: object): ViewContextRoutes => ({
  urlHelpers: () => helpers,
  mountedHelpers: () => ({}),
});

/** Compile and run a `.tse` source through `Template#render`, as Rails does. */
const renderTse = (source: string, locals: Record<string, unknown>, view: Base): string =>
  new Template({ source, identifier: "t", extension: "tse", handler: new Tse() }).render(
    view,
    locals,
  );

describe("ActionView::Rendering::ClassMethods", () => {
  it("builds on DetailsKey.view_context_class, per rendering.rb:53", () => {
    class C extends Controller {}
    const klass = C.viewContextClass();
    expect(new klass(null, {}, null).compiledMethodContainer()).toBe(DetailsKey.viewContextClass());
  });

  it("memoizes the view class per controller class", () => {
    class C extends Controller {}
    expect(C.viewContextClass()).toBe(C.viewContextClass());
  });

  it("inherit_view_context_class? reuses the superclass class when routes and helpers match", () => {
    class Parent extends Controller {}
    class Child extends Parent {}
    expect(Child.viewContextClass()).toBe(Parent.viewContextClass());
  });

  it("builds a fresh view class when the subclass has its own helpers", () => {
    class Parent extends Controller {}
    class Child extends Parent {
      static override _helpers = { currentUser: () => "Ada" };
    }
    expect(Child.viewContextClass()).not.toBe(Parent.viewContextClass());
  });

  it("includes a controller's helpers module onto the view", () => {
    class C extends Controller {
      static override _helpers = {
        currentUser(this: Base) {
          return (this.controller as { user: string }).user;
        },
      };
    }
    const view = new (C.viewContextClass())(null, {}, { user: "Ada" });
    expect((view as unknown as { currentUser(): string }).currentUser()).toBe("Ada");
  });

  it("walks the module's own prototype chain, as include walks ancestors", () => {
    const parent = { fromParent: () => "parent" };
    const helpers = Object.create(parent) as Record<string, unknown>;
    helpers.fromChild = () => "child";
    class C extends Controller {
      static override _helpers = helpers;
    }
    const view = new (C.viewContextClass())(null, {}, null) as unknown as {
      fromParent(): string;
      fromChild(): string;
    };
    expect(view.fromParent()).toBe("parent");
    expect(view.fromChild()).toBe("child");
  });

  it("brings an accessor across, the way Ruby's include does", () => {
    class C extends Controller {
      static override _helpers = {
        get currentUser(): string {
          return ((this as unknown as Base).controller as { user: string }).user;
        },
      };
    }
    const view = new (C.viewContextClass())(null, {}, { user: "Ada" });
    expect((view as unknown as { currentUser: string }).currentUser).toBe("Ada");
  });

  it("lets a helper shadow an inherited Base method, as include ranks above the superclass", () => {
    class C extends Controller {
      static override _helpers = { capture: () => "from the helper module" };
    }
    const view = new (C.viewContextClass())(null, {}, null);
    expect((view.capture as unknown as () => string)()).toBe("from the helper module");
    expect(Base.prototype.capture).not.toBe(view.capture);
  });

  it("includes routes.url_helpers so a route helper is a bare identifier in a template", () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    try {
      class C extends Controller {
        static override _routes = routesWith({ postsPath: () => "/posts" });
      }
      const view = new (C.viewContextClass())(null, {}, null);
      expect(renderTse("<%= postsPath() %>", {}, view)).toBe("/posts");
    } finally {
      TemplateHandlers.clear();
    }
  });

  it("makes a helper_method-style helper resolvable as a bare identifier in a template", () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    try {
      class C extends Controller {
        static override _helpers = {
          currentUser(this: Base) {
            return (this.controller as { user: string }).user;
          },
        };
      }
      const view = new (C.viewContextClass())(null, {}, { user: "Ada" });
      expect(renderTse("<%= currentUser() %>", {}, view)).toBe("Ada");
    } finally {
      TemplateHandlers.clear();
    }
  });
});
