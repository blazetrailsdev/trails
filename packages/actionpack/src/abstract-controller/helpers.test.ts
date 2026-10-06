import { describe, expect, it } from "vitest";
import { extend, include, Module, NoMethodError } from "@blazetrails/ruby-compat";

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

class Named {
  #name?: string;

  constructor(name?: string) {
    this.#name = name;
  }

  get name(): string | undefined {
    return this.#name;
  }

  set name(value: string | undefined) {
    this.#name = value;
  }
}

type View = Record<string, (...args: unknown[]) => unknown>;

function view(cls: HelpersClass, controller: object = {}): View {
  return extend({ controller } as unknown as View, cls._helpers!);
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
    expect(view(cls, controller).currentUser()).toEqual({ id: 1 });
    expect(view(cls, controller).loggedIn()).toBe(true);
  });

  it("a field-backed attribute registered without a writer reads through the helper", () => {
    const cls = makeBase();
    helperMethod.call(cls, "name");

    const proxy = extend({ controller: { name: "david" } } as { name?: string }, cls._helpers!);
    expect(proxy.name).toBe("david");
    expect(() => (proxy.name = "jamis")).toThrow(TypeError);
  });

  it.each([
    ["reader then writer", ["name", "name="]],
    ["writer then reader", ["name=", "name"]],
  ])("a name= entry reads and writes an attribute (%s)", (_order, names) => {
    const cls = makeBase();
    helperMethod.call(cls, ...names);

    const controller = new Named("david");
    const view = extend({ controller } as { controller: object; name: string }, cls._helpers!);
    expect(view.name).toBe("david");
    view.name = "jamis";
    expect(controller.name).toBe("jamis");
    expect(Object.hasOwn(view, "name")).toBe(false);
  });

  it("a lone name= entry defines the attribute with both halves", () => {
    const cls = makeBase();
    helperMethod.call(cls, "name=");

    const controller = new Named();
    const view = extend({ controller } as { controller: object; name?: string }, cls._helpers!);
    view.name = "jamis";
    expect(controller.name).toBe("jamis");
    expect(view.name).toBe("jamis");
  });

  it("a writer entry is sent to the controller, reaching a setName method", () => {
    const cls = makeBase();
    helperMethod.call(cls, "name=");

    const controller = {
      written: null as unknown,
      setName(value: unknown) {
        this.written = value;
      },
    };
    extend({ controller } as { name?: string }, cls._helpers!).name = "jamis";
    expect(controller.written).toBe("jamis");
  });

  it("a writer entry for a field with no writer raises NoMethodError", () => {
    const cls = makeBase();
    helperMethod.call(cls, "name=");

    const controller = { name: "david" };
    const proxy = extend({ controller } as { name?: string }, cls._helpers!);
    expect(() => (proxy.name = "jamis")).toThrow(NoMethodError);
  });

  it("an operator name ending in = is forwarded as a method, not read as a writer", () => {
    const cls = makeBase();
    helperMethod.call(cls, "==");

    const controller = { equals: (other: unknown) => other === 1 };
    expect(view(cls, controller)["=="](1)).toBe(true);
    expect(cls._helpers!.instanceMethods()).toEqual(["=="]);
  });

  it("a name= entry survives clearHelpers' replay", () => {
    const cls = makeBase();
    helperMethod.call(cls, "name", "name=");
    cls.clearHelpers();

    const controller = new Named("david");
    const view = extend({ controller } as { controller: object; name: string }, cls._helpers!);
    view.name = "jamis";
    expect(view.name).toBe("jamis");
    expect(controller.name).toBe("jamis");
  });

  it("flattens nested name arrays (Rails `methods.flatten!`)", () => {
    const cls = makeBase();
    helperMethod.call(cls, "a", ["b", "c"]);
    expect(cls._helperMethods).toEqual(["a", "b", "c"]);
    expect(cls._helpers!.instanceMethods().sort()).toEqual(["a", "b", "c"]);
  });

  it("throws when controller does not respond to the named method", () => {
    const cls = makeBase();
    helperMethod.call(cls, "missing");
    expect(() => view(cls).missing()).toThrow(NoMethodError);
  });

  it("copy-on-write: subclass writes don't pollute the parent", () => {
    const parent = makeBase();
    helperMethod.call(parent, "fromParent");

    const child = Object.create(parent) as HelpersClass;
    helperMethod.call(child, "fromChild");

    expect(child._helpers!.instanceMethods()).toEqual(["fromChild"]);
    expect("fromParent" in view(child)).toBe(true);
    expect(parent._helpers!.instanceMethods()).toEqual(["fromParent"]);
    expect(parent._helperMethods).toEqual(["fromParent"]);
    expect(child._helperMethods).toEqual(["fromParent", "fromChild"]);
  });

  it("parent additions made after subclass mutation remain visible (ancestor link)", () => {
    const parent = makeBase();
    helperMethod.call(parent, "early");

    const child = Object.create(parent) as HelpersClass;
    helperMethod.call(child, "childOnly");
    helperMethod.call(parent, "late");

    expect("late" in view(child)).toBe(true);
    expect("early" in view(child)).toBe(true);
    expect("childOnly" in view(child)).toBe(true);
  });
});

describe("helper", () => {
  it("includes a module's methods into _helpers", () => {
    const cls = makeBase();
    const FooHelper = new Module().include({ foo: () => "FOO" });
    cls.helper(FooHelper);
    expect(view(cls).foo()).toBe("FOO");
  });

  it("is idempotent when the same module is included twice", () => {
    const cls = makeBase();
    const FooHelper = new Module().include({ foo: () => "FOO" });
    cls.helper(FooHelper);
    const helpersBefore = cls._helpers;
    cls.helper(FooHelper);
    expect(cls._helpers).toBe(helpersBefore);
    expect(view(cls).foo()).toBe("FOO");
  });

  it("a duplicate-include no-op does NOT fork the subclass helpers module", () => {
    const parent = makeBase();
    const FooHelper = new Module().include({ foo: () => "FOO" });
    parent.helper(FooHelper);
    const child = Object.create(parent) as HelpersClass;

    child.helper(FooHelper);

    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(false);
    expect(child._helpers).toBe(parent._helpers);
  });

  it("re-including a module after a later module overrode its method is a no-op (identity-based)", () => {
    const cls = makeBase();
    const A = new Module().include({ foo: () => "A.foo" });
    const B = new Module().include({ foo: () => "B.foo" });
    cls.helper(A);
    cls.helper(B);
    expect(view(cls).foo()).toBe("B.foo");
    cls.helper(A);
    expect(view(cls).foo()).toBe("B.foo");
  });

  it("evaluates a trailing block against the helpers module (Rails `helper do ... end`)", () => {
    const cls = makeBase();
    cls.helper((mod) => {
      mod.wadus = () => "wadus";
    });
    expect(view(cls).wadus()).toBe("wadus");
  });

  it("direct-method precedence: helperMethod beats a later helper(Mod) with the same name", () => {
    const cls = makeBase();
    helperMethod.call(cls, "x");
    const Override = new Module().include({ x: () => "from-module" });
    cls.helper(Override);
    expect(() => view(cls).x()).toThrow(NoMethodError);
  });

  it("included modules stay live — methods added after include are visible", () => {
    const cls = makeBase();
    const Live = new Module().include({ early: () => "early" });
    cls.helper(Live);
    Live.defineMethod("late", () => "late");
    expect(view(cls).early()).toBe("early");
    expect(view(cls).late()).toBe("late");
  });

  it("multiple includes layer in the ancestor chain (both reachable)", () => {
    const cls = makeBase();
    const A = new Module().include({ fromA: () => "A" });
    const B = new Module().include({ fromB: () => "B" });
    cls.helper(A);
    cls.helper(B);
    expect(view(cls).fromA()).toBe("A");
    expect(view(cls).fromB()).toBe("B");
  });

  it("an included module is enumerable, so including _helpers elsewhere carries it", () => {
    const cls = makeBase();
    const FooHelper = new Module().include({ foo: () => "FOO" });
    cls.helper(FooHelper);

    class ViewContext {}
    include(ViewContext, cls._helpers!);

    expect(typeof (ViewContext.prototype as unknown as { foo: () => string }).foo).toBe("function");
    expect((ViewContext.prototype as unknown as { foo: () => string }).foo()).toBe("FOO");
  });

  it("carries every layered module, and helper_method proxies with them", () => {
    const cls = makeBase();
    cls.helper(new Module().include({ fromA: () => "A" }));
    cls.helper(new Module().include({ fromB: () => "B" }));
    helperMethod.call(cls, "currentUser");

    class ViewContext {}
    include(ViewContext, cls._helpers!);

    const proto = ViewContext.prototype as unknown as Record<string, () => string>;
    expect(typeof proto.fromA).toBe("function");
    expect(typeof proto.fromB).toBe("function");
    expect("currentUser" in proto).toBe(true);
  });

  it("accepts modules and a block mixed together", () => {
    const cls = makeBase();
    const FooHelper = new Module().include({ foo: () => "FOO" });
    cls.helper(FooHelper, (mod) => {
      mod.bar = () => "BAR";
    });
    expect(view(cls).foo()).toBe("FOO");
    expect(view(cls).bar()).toBe("BAR");
  });
});

describe("identity tracking lives on the helpers module chain, not the class", () => {
  it("after clearHelpers, the same module can be re-included on the cleared child", () => {
    const parent = makeBase();
    const Shared = new Module().include({ shared: () => "S" });
    parent.helper(Shared);
    const child = Object.create(parent) as HelpersClass;

    child.helper(Shared);
    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(false);

    child.clearHelpers();
    child.helper(Shared);
    expect(view(child).shared()).toBe("S");
  });
});

describe("clearHelpers", () => {
  it("wipes _helpers + _helperMethods, then re-adds the previous helper_method proxies", () => {
    const cls = makeBase();
    const ExtraHelper = new Module().include({ extra: () => "EXTRA" });
    helperMethod.call(cls, "keep");
    cls.helper(ExtraHelper);
    expect("keep" in view(cls)).toBe(true);
    expect("extra" in view(cls)).toBe(true);

    cls.clearHelpers();

    expect(cls._helperMethods).toEqual(["keep"]);
    expect(cls._helpers!.instanceMethods()).toEqual(["keep"]);
    expect("keep" in view(cls)).toBe(true);
    expect(view(cls).extra).toBeUndefined();
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
    expect(_helpersInstance.call(host).instanceMethods()).toEqual([]);
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
    expect(mod.isInclude(parent._helpers!)).toBe(true);
    expect(mod.instanceMethods()).toEqual([]);
    expect("fromParent" in view(child)).toBe(true);

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
    expect(mod.isInclude(parent._helpers!)).toBe(true);
    helperMethod.call(parent, "addedLater");
    expect("addedLater" in extend({}, mod)).toBe(true);
  });
});
