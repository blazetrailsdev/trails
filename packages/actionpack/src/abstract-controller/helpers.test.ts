import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";

import {
  _helpers,
  _helpersInstance,
  defineHelpersModule,
  helperMethod,
  Helpers,
  type HelperMethodsModule,
  type HelpersClass,
  type HelpersClassMethods,
  type HelpersHost,
} from "./helpers.js";

function makeBase(): HelpersClass {
  const Base = class Base {};
  include(Base, Helpers);
  return Base as unknown as HelpersClass;
}

describe("helperMethod", () => {
  it("registers a proxy that forwards to controller[name]", () => {
    const cls = makeBase();
    helperMethod.call(cls, "currentUser", "loggedIn");
    expect(cls._helperMethods).toEqual(["currentUser", "loggedIn"]);

    const controller = {
      currentUser: () => ({ id: 1 }),
      loggedIn: () => true,
    };
    const proxy = { controller };
    expect(cls._helpers!.currentUser.call(proxy)).toEqual({ id: 1 });
    expect(cls._helpers!.loggedIn.call(proxy)).toBe(true);
  });

  it.each([
    ["reader then writer", ["name", "name="]],
    ["writer then reader", ["name=", "name"]],
  ])("a name= entry reads and writes a field-backed attribute (%s)", (_order, names) => {
    const cls = makeBase();
    helperMethod.call(cls, ...names);

    const controller: { name?: string } = { name: "david" };
    const view = Object.create(cls._helpers!) as { controller: object; name: string };
    view.controller = controller;
    expect(view.name).toBe("david");
    view.name = "jamis";
    expect(controller.name).toBe("jamis");
    expect(Object.hasOwn(view, "name")).toBe(false);
  });

  it("a lone name= entry defines the attribute with both halves", () => {
    const cls = makeBase();
    helperMethod.call(cls, "name=");

    const controller: { name?: string } = {};
    const view = Object.create(cls._helpers!) as { controller: object; name?: string };
    view.controller = controller;
    view.name = "jamis";
    expect(controller.name).toBe("jamis");
    expect(view.name).toBe("jamis");
  });

  it("an operator name ending in = is forwarded as a method, not read as a writer", () => {
    const cls = makeBase();
    helperMethod.call(cls, "==");

    const proxy = { controller: { "==": (other: unknown) => other === 1 } };
    expect(cls._helpers!["=="].call(proxy, 1)).toBe(true);
    expect(Object.hasOwn(cls._helpers!, "=")).toBe(false);
  });

  it("a name= entry survives clearHelpers' replay", () => {
    const cls = makeBase();
    helperMethod.call(cls, "name", "name=");
    cls.clearHelpers();

    const controller: { name?: string } = { name: "david" };
    const view = Object.create(cls._helpers!) as { controller: object; name: string };
    view.controller = controller;
    view.name = "jamis";
    expect(view.name).toBe("jamis");
    expect(controller.name).toBe("jamis");
  });

  it("flattens nested name arrays (Rails `methods.flatten!`)", () => {
    const cls = makeBase();
    helperMethod.call(cls, "a", ["b", "c"]);
    expect(cls._helperMethods).toEqual(["a", "b", "c"]);
    expect(Object.keys(cls._helpers!).sort()).toEqual(["a", "b", "c"]);
  });

  it("throws when controller does not respond to the named method", () => {
    const cls = makeBase();
    helperMethod.call(cls, "missing");
    expect(() => cls._helpers!.missing.call({ controller: {} })).toThrow(
      /does not respond to 'missing'/,
    );
  });

  it("copy-on-write: subclass writes don't pollute the parent", () => {
    const parent = makeBase();
    helperMethod.call(parent, "fromParent");

    const child = Object.create(parent) as HelpersClass;
    helperMethod.call(child, "fromChild");

    expect(Object.keys(child._helpers!)).toEqual(["fromChild"]);
    expect(typeof child._helpers!.fromParent).toBe("function");
    expect(Object.keys(parent._helpers!)).toEqual(["fromParent"]);
    expect(parent._helperMethods).toEqual(["fromParent"]);
    expect(child._helperMethods).toEqual(["fromParent", "fromChild"]);
  });

  it("parent additions made after subclass mutation remain visible (ancestor link)", () => {
    const parent = makeBase();
    helperMethod.call(parent, "early");

    const child = Object.create(parent) as HelpersClass;
    helperMethod.call(child, "childOnly");
    helperMethod.call(parent, "late");

    expect(typeof child._helpers!.late).toBe("function");
    expect(typeof child._helpers!.early).toBe("function");
    expect(typeof child._helpers!.childOnly).toBe("function");
  });
});

describe("helper", () => {
  it("includes a module's methods into _helpers", () => {
    const cls = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    cls.helper(FooHelper);
    expect(cls._helpers!.foo.call({})).toBe("FOO");
  });

  it("is idempotent when the same module is included twice", () => {
    const cls = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    cls.helper(FooHelper);
    const fooBefore = cls._helpers!.foo;
    const headProtoBefore = Object.getPrototypeOf(cls._helpers!);
    cls.helper(FooHelper);
    expect(cls._helpers!.foo).toBe(fooBefore);
    expect(Object.getPrototypeOf(cls._helpers!)).toBe(headProtoBefore);
  });

  it("a duplicate-include no-op does NOT fork the subclass helpers module", () => {
    const parent = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    parent.helper(FooHelper);
    const child = Object.create(parent) as HelpersClass;

    child.helper(FooHelper);

    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(false);
    expect(child._helpers).toBe(parent._helpers);
  });

  it("re-including a module after a later module overrode its method is a no-op (identity-based)", () => {
    const cls = makeBase();
    const A: HelperMethodsModule = { foo: () => "A.foo" };
    const B: HelperMethodsModule = { foo: () => "B.foo" };
    cls.helper(A);
    cls.helper(B);
    expect(cls._helpers!.foo.call({})).toBe("B.foo");
    cls.helper(A);
    expect(cls._helpers!.foo.call({})).toBe("B.foo");
  });

  it("evaluates a trailing block against the helpers module (Rails `helper do ... end`)", () => {
    const cls = makeBase();
    cls.helper((mod: HelperMethodsModule) => {
      mod.wadus = () => "wadus";
    });
    expect(cls._helpers!.wadus.call({})).toBe("wadus");
  });

  it("direct-method precedence: helperMethod beats a later helper(Mod) with the same name", () => {
    const cls = makeBase();
    helperMethod.call(cls, "x");
    const Override: HelperMethodsModule = { x: () => "from-module" };
    cls.helper(Override);
    expect(typeof cls._helpers!.x).toBe("function");
    expect(() => cls._helpers!.x.call({ controller: {} })).toThrow(/does not respond to 'x'/);
  });

  it("included modules stay live — methods added after include are visible", () => {
    const cls = makeBase();
    const Live: HelperMethodsModule = { early: () => "early" };
    cls.helper(Live);
    Live.late = () => "late";
    expect(cls._helpers!.early.call({})).toBe("early");
    expect(cls._helpers!.late.call({})).toBe("late");
  });

  it("multiple includes layer in the ancestor chain (both reachable)", () => {
    const cls = makeBase();
    const A: HelperMethodsModule = { fromA: () => "A" };
    const B: HelperMethodsModule = { fromB: () => "B" };
    cls.helper(A);
    cls.helper(B);
    expect(cls._helpers!.fromA.call({})).toBe("A");
    expect(cls._helpers!.fromB.call({})).toBe("B");
  });

  it("an included module is enumerable, so including _helpers elsewhere carries it", () => {
    const cls = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    cls.helper(FooHelper);

    class ViewContext {}
    include(ViewContext, cls._helpers!);

    expect(typeof (ViewContext.prototype as unknown as { foo: () => string }).foo).toBe("function");
    expect((ViewContext.prototype as unknown as { foo: () => string }).foo()).toBe("FOO");
  });

  it("carries every layered module, and helper_method proxies with them", () => {
    const cls = makeBase();
    cls.helper({ fromA: () => "A" } as HelperMethodsModule);
    cls.helper({ fromB: () => "B" } as HelperMethodsModule);
    helperMethod.call(cls, "currentUser");

    class ViewContext {}
    include(ViewContext, cls._helpers!);

    const proto = ViewContext.prototype as unknown as Record<string, () => string>;
    expect(typeof proto.fromA).toBe("function");
    expect(typeof proto.fromB).toBe("function");
    expect(typeof proto.currentUser).toBe("function");
  });

  it("accepts modules and a block mixed together", () => {
    const cls = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    cls.helper(FooHelper, (mod: HelperMethodsModule) => {
      mod.bar = () => "BAR";
    });
    expect(cls._helpers!.foo.call({})).toBe("FOO");
    expect(cls._helpers!.bar.call({})).toBe("BAR");
  });
});

describe("identity tracking lives on the helpers module chain, not the class", () => {
  it("after clearHelpers, the same module can be re-included on the cleared child", () => {
    const parent = makeBase();
    const Shared: HelperMethodsModule = { shared: () => "S" };
    parent.helper(Shared);
    const child = Object.create(parent) as HelpersClass;

    child.helper(Shared);
    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(false);

    child.clearHelpers();
    child.helper(Shared);
    expect(child._helpers!.shared.call({})).toBe("S");
  });
});

describe("clearHelpers", () => {
  it("wipes _helpers + _helperMethods, then re-adds the previous helper_method proxies", () => {
    const cls = makeBase();
    const ExtraHelper: HelperMethodsModule = { extra: () => "EXTRA" };
    helperMethod.call(cls, "keep");
    cls.helper(ExtraHelper);
    expect(typeof cls._helpers!.keep).toBe("function");
    expect(typeof cls._helpers!.extra).toBe("function");

    cls.clearHelpers();

    expect(cls._helperMethods).toEqual(["keep"]);
    expect(Object.keys(cls._helpers!)).toEqual(["keep"]);
    expect(typeof cls._helpers!.keep).toBe("function");
    expect(cls._helpers!.extra).toBeUndefined();
  });
});

describe("_helpersInstance", () => {
  it("returns this.class._helpers", () => {
    const cls = makeBase();
    helperMethod.call(cls, "x");
    const host = { constructor: cls } as unknown as HelpersHost;
    expect(_helpersInstance.call(host)).toBe(cls._helpers);
  });

  it("falls back to an empty module when no _helpers is set", () => {
    const cls = makeBase();
    const host = { constructor: cls } as unknown as HelpersHost;
    expect(_helpersInstance.call(host)).toEqual({});
  });
});

describe("_helpersForModification", () => {
  it("returns the own module when present, else links the inherited one as an ancestor", () => {
    const parent = makeBase();
    helperMethod.call(parent, "fromParent");
    const child = Object.create(parent) as HelpersClass;

    const mod = child._helpersForModification();
    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(true);
    expect(mod).not.toBe(parent._helpers);
    expect(Object.getPrototypeOf(mod)).toBe(parent._helpers);
    expect(Object.keys(mod)).toEqual([]);
    expect(typeof mod.fromParent).toBe("function");

    expect(child._helpersForModification()).toBe(mod);
  });

  it("also flattens deeply nested array inputs", () => {
    const cls = makeBase();
    helperMethod.call(cls, ["a", ["b", ["c"]]]);
    expect(cls._helperMethods).toEqual(["a", "b", "c"]);
  });
});

describe("_helpers (class-level reader/writer)", () => {
  it("reads from the class, falling through to the parent via prototype", () => {
    const parent = makeBase();
    helperMethod.call(parent, "fromParent");
    const child = Object.create(parent) as HelpersClass;

    expect(_helpers(child)).toBe(parent._helpers);
  });

  it("writer assigns the slot; subsequent reads return that value", () => {
    const cls = makeBase();
    const mod = { hello: () => "world" } as unknown as HelperMethodsModule;
    _helpers(cls, mod);
    expect(cls._helpers).toBe(mod);
    expect(_helpers(cls)).toBe(mod);
  });

  it("writer with null deletes the own slot to restore parent fallback", () => {
    const parent = makeBase();
    helperMethod.call(parent, "fromParent");
    const child = Object.create(parent) as HelpersClass;
    const ownMod = {} as HelperMethodsModule;
    _helpers(child, ownMod);
    expect(child._helpers).toBe(ownMod);

    _helpers(child, null);
    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(false);
    expect(child._helpers).toBe(parent._helpers);
  });

  it("instance form delegates to _helpersInstance (class._helpers)", () => {
    const cls = makeBase();
    helperMethod.call(cls, "shown");
    const host = { constructor: cls } as HelpersHost;
    const instanceReader = _helpers as (this: HelpersHost) => HelperMethodsModule;
    expect(instanceReader.call(host)).toBe(cls._helpers);
  });
});

describe("defineHelpersModule", () => {
  it("is idempotent per class — same class returns the same module", () => {
    const cls: HelpersClassMethods = { name: "Base" };
    const first = defineHelpersModule(cls);
    const second = defineHelpersModule(cls);
    expect(second).toBe(first);
  });

  it("does NOT write cls._helpers (caller is responsible, per Rails)", () => {
    const cls: HelpersClassMethods = { name: "Base" };
    defineHelpersModule(cls);
    expect(Object.prototype.hasOwnProperty.call(cls, "_helpers")).toBe(false);
  });

  it("splices the parent helpers module into the prototype chain", () => {
    const parent = makeBase();
    helperMethod.call(parent, "fromParent");
    const child: HelpersClassMethods = { name: "Child" };
    const mod = defineHelpersModule(child, parent._helpers);
    expect(Object.getPrototypeOf(mod)).toBe(parent._helpers);
    helperMethod.call(parent, "addedLater");
    expect(typeof mod.addedLater).toBe("function");
  });
});
