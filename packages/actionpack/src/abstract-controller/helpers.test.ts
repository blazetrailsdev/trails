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

    expect(Object.keys(child._helpers!)).toEqual(["fromParent", "fromChild"]);
    expect(Object.keys(parent._helpers!)).toEqual(["fromParent"]);
    expect(parent._helperMethods).toEqual(["fromParent"]);
    expect(child._helperMethods).toEqual(["fromParent", "fromChild"]);
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
    helper(cls, FooHelper);
    expect(cls._helpers!.foo).toBe(fooBefore);
    expect(Object.keys(cls._helpers!)).toEqual(["foo"]);
  });

  it("evaluates a trailing block against the helpers module (Rails `helper do ... end`)", () => {
    const cls = makeBase();
    helper(cls, (mod: HelperMethodsModule) => {
      mod.wadus = () => "wadus";
    });
    expect(cls._helpers!.wadus.call({})).toBe("wadus");
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

describe("clearHelpers", () => {
  it("wipes _helpers + _helperMethods, then re-adds the previous helper_method proxies", () => {
    const cls = makeBase();
    const ExtraHelper: HelperMethodsModule = { extra: () => "EXTRA" };
    helperMethod(cls, "keep");
    helper(cls, ExtraHelper);
    expect(Object.keys(cls._helpers!).sort()).toEqual(["extra", "keep"]);

    clearHelpers(cls);

    // helper_method names survive; included modules do not.
    expect(cls._helperMethods).toEqual(["keep"]);
    expect(Object.keys(cls._helpers!)).toEqual(["keep"]);
    expect(typeof cls._helpers!.keep).toBe("function");
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
  it("returns the own module when present, else clones the inherited one", () => {
    const parent = makeBase();
    helperMethod(parent, "fromParent");
    const child: HelpersClassMethods = Object.create(parent) as HelpersClassMethods;

    const mod = _helpersForModification(child);
    expect(Object.prototype.hasOwnProperty.call(child, "_helpers")).toBe(true);
    expect(mod).not.toBe(parent._helpers);
    expect(Object.keys(mod)).toEqual(["fromParent"]);

    expect(_helpersForModification(child)).toBe(mod);
  });
});
