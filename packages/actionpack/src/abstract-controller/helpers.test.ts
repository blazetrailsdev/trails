import { describe, expect, it } from "vitest";

import {
  _helpersForModification,
  _helpersInstance,
  applyHelpers,
  clearHelpers,
  helper,
  helperMethod,
  type HelperMethodsModule,
  type HelpersClassMethods,
  type HelpersHost,
} from "./helpers.js";

function makeBase(): HelpersClassMethods & { name: string } {
  return { name: "Base" } as HelpersClassMethods & { name: string };
}

describe("applyHelpers", () => {
  it("is a no-op so subclasses inherit the parent's _helpers via prototype", () => {
    class Parent {
      static _helpers: HelperMethodsModule = { hi: () => "hi" };
      static _helperMethods = ["hi"];
    }
    class Child extends Parent {}
    applyHelpers(Child as unknown as new (...a: never[]) => unknown);
    expect(Object.prototype.hasOwnProperty.call(Child, "_helpers")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Child, "_helperMethods")).toBe(false);
    expect(Child._helpers.hi).toBe(Parent._helpers.hi);
    expect(Child._helperMethods).toEqual(["hi"]);
  });
});

describe("helperMethod", () => {
  it("registers a proxy that forwards to controller[name]", () => {
    const cls = makeBase();
    helperMethod(cls, "currentUser", "loggedIn");
    expect(cls._helperMethods).toEqual(["currentUser", "loggedIn"]);

    const controller = {
      currentUser: () => ({ id: 1 }),
      loggedIn: () => true,
    };
    const proxy = { controller };
    expect(cls._helpers!.currentUser.call(proxy)).toEqual({ id: 1 });
    expect(cls._helpers!.loggedIn.call(proxy)).toBe(true);
  });

  it("flattens nested name arrays (Rails `methods.flatten!`)", () => {
    const cls = makeBase();
    helperMethod(cls, "a", ["b", "c"]);
    expect(cls._helperMethods).toEqual(["a", "b", "c"]);
    expect(Object.keys(cls._helpers!).sort()).toEqual(["a", "b", "c"]);
  });

  it("throws when controller does not respond to the named method", () => {
    const cls = makeBase();
    helperMethod(cls, "missing");
    expect(() => cls._helpers!.missing.call({ controller: {} })).toThrow(
      /does not respond to 'missing'/,
    );
  });

  it("copy-on-write: subclass writes don't pollute the parent", () => {
    const parent = makeBase();
    helperMethod(parent, "fromParent");

    const child: HelpersClassMethods = Object.create(parent) as HelpersClassMethods;
    helperMethod(child, "fromChild");

    expect(Object.keys(child._helpers!)).toEqual(["fromChild"]);
    expect(typeof child._helpers!.fromParent).toBe("function");
    expect(Object.keys(parent._helpers!)).toEqual(["fromParent"]);
    expect(parent._helperMethods).toEqual(["fromParent"]);
    expect(child._helperMethods).toEqual(["fromParent", "fromChild"]);
  });

  it("parent additions made after subclass mutation remain visible (ancestor link)", () => {
    const parent = makeBase();
    helperMethod(parent, "early");

    const child: HelpersClassMethods = Object.create(parent) as HelpersClassMethods;
    helperMethod(child, "childOnly");
    helperMethod(parent, "late");

    expect(typeof child._helpers!.late).toBe("function");
    expect(typeof child._helpers!.early).toBe("function");
    expect(typeof child._helpers!.childOnly).toBe("function");
  });
});

describe("helper", () => {
  it("includes a module's methods into _helpers", () => {
    const cls = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    helper(cls, FooHelper);
    expect(cls._helpers!.foo.call({})).toBe("FOO");
  });

  it("is idempotent when the same module is included twice", () => {
    const cls = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    helper(cls, FooHelper);
    const fooBefore = cls._helpers!.foo;
    const headProtoBefore = Object.getPrototypeOf(cls._helpers!);
    helper(cls, FooHelper);
    // Re-include is a no-op: the lookup still resolves to the same fn,
    // and no new proto link was spliced in.
    expect(cls._helpers!.foo).toBe(fooBefore);
    expect(Object.getPrototypeOf(cls._helpers!)).toBe(headProtoBefore);
  });

  it("a duplicate-include no-op does NOT fork the subclass helpers module", () => {
    const parent = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    helper(parent, FooHelper);
    const child: HelpersClassMethods = Object.create(parent) as HelpersClassMethods;

    helper(child, FooHelper);

    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(false);
    expect(child._helpers).toBe(parent._helpers);
  });

  it("re-including a module after a later module overrode its method is a no-op (identity-based)", () => {
    const cls = makeBase();
    const A: HelperMethodsModule = { foo: () => "A.foo" };
    const B: HelperMethodsModule = { foo: () => "B.foo" };
    helper(cls, A);
    helper(cls, B);
    expect(cls._helpers!.foo.call({})).toBe("B.foo");
    helper(cls, A);
    // B's override stays in place; A is identity-deduped.
    expect(cls._helpers!.foo.call({})).toBe("B.foo");
  });

  it("evaluates a trailing block against the helpers module (Rails `helper do ... end`)", () => {
    const cls = makeBase();
    helper(cls, (mod: HelperMethodsModule) => {
      mod.wadus = () => "wadus";
    });
    expect(cls._helpers!.wadus.call({})).toBe("wadus");
  });

  it("direct-method precedence: helperMethod beats a later helper(Mod) with the same name", () => {
    const cls = makeBase();
    helperMethod(cls, "x");
    const Override: HelperMethodsModule = { x: () => "from-module" };
    helper(cls, Override);
    // Definition on the helpers module itself stays on top of the chain.
    expect(typeof cls._helpers!.x).toBe("function");
    // The proxy installed by helperMethod throws when controller lacks x,
    // proving the helperMethod proxy is what runs (not Override.x).
    expect(() => cls._helpers!.x.call({ controller: {} })).toThrow(/does not respond to 'x'/);
  });

  it("included modules stay live — methods added after include are visible", () => {
    const cls = makeBase();
    const Live: HelperMethodsModule = { early: () => "early" };
    helper(cls, Live);
    Live.late = () => "late";
    expect(cls._helpers!.early.call({})).toBe("early");
    expect(cls._helpers!.late.call({})).toBe("late");
  });

  it("multiple includes layer in the ancestor chain (both reachable)", () => {
    const cls = makeBase();
    const A: HelperMethodsModule = { fromA: () => "A" };
    const B: HelperMethodsModule = { fromB: () => "B" };
    helper(cls, A);
    helper(cls, B);
    expect(cls._helpers!.fromA.call({})).toBe("A");
    expect(cls._helpers!.fromB.call({})).toBe("B");
  });

  it("accepts modules and a block mixed together", () => {
    const cls = makeBase();
    const FooHelper: HelperMethodsModule = { foo: () => "FOO" };
    helper(cls, FooHelper, (mod: HelperMethodsModule) => {
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
    helper(parent, Shared);
    const child: HelpersClassMethods = Object.create(parent) as HelpersClassMethods;

    helper(child, Shared);
    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(false);

    clearHelpers(child);
    helper(child, Shared);
    // Re-included successfully — clearHelpers severed the chain so the
    // earlier identity record on parent's helpers module is no longer
    // reachable from child._helpers.
    expect(child._helpers!.shared.call({})).toBe("S");
  });
});

describe("clearHelpers", () => {
  it("wipes _helpers + _helperMethods, then re-adds the previous helper_method proxies", () => {
    const cls = makeBase();
    const ExtraHelper: HelperMethodsModule = { extra: () => "EXTRA" };
    helperMethod(cls, "keep");
    helper(cls, ExtraHelper);
    expect(typeof cls._helpers!.keep).toBe("function");
    expect(typeof cls._helpers!.extra).toBe("function");

    clearHelpers(cls);

    // helper_method names survive; included modules do not.
    expect(cls._helperMethods).toEqual(["keep"]);
    expect(Object.keys(cls._helpers!)).toEqual(["keep"]);
    expect(typeof cls._helpers!.keep).toBe("function");
    expect(cls._helpers!.extra).toBeUndefined();
  });
});

describe("_helpersInstance", () => {
  it("returns this.class._helpers", () => {
    const cls = makeBase();
    helperMethod(cls, "x");
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
    helperMethod(parent, "fromParent");
    const child: HelpersClassMethods = Object.create(parent) as HelpersClassMethods;

    const mod = _helpersForModification(child);
    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(true);
    expect(mod).not.toBe(parent._helpers);
    expect(Object.getPrototypeOf(mod)).toBe(parent._helpers);
    expect(Object.keys(mod)).toEqual([]);
    expect(typeof mod.fromParent).toBe("function");

    expect(_helpersForModification(child)).toBe(mod);
  });

  it("also flattens deeply nested array inputs", () => {
    const cls = makeBase();
    helperMethod(cls, ["a", ["b", ["c"]]]);
    expect(cls._helperMethods).toEqual(["a", "b", "c"]);
  });
});
