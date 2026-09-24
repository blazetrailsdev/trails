import { beforeEach, describe, it, expect } from "vitest";
import { Module, extend, include } from "@blazetrails/ruby-compat";
import { includedModules, prepend } from "@blazetrails/ruby-compat/include";
import { Concern, MultipleIncludedBlocks, MultiplePrependBlocks } from "./concern.js";
import {
  assertNotRespondTo,
  assertNothingRaised,
  assertRaises,
  assertNil,
} from "./testing/assertions.js";

function newConcern(): any {
  const mod = new Module();
  extend(mod, Concern);
  return mod;
}

const Baz = newConcern();
Baz.classMethods((mod: Record<string, unknown>) => {
  Object.defineProperties(mod, {
    includedRan: {
      get(this: any) {
        return this["@included_ran"] ?? null;
      },
      set(this: any, value) {
        this["@included_ran"] = value;
      },
      enumerable: true,
      configurable: true,
    },
    prependedRan: {
      get(this: any) {
        return this["@prepended_ran"] ?? null;
      },
      set(this: any, value) {
        this["@prepended_ran"] = value;
      },
      enumerable: true,
      configurable: true,
    },
  });
  mod.baz = function () {
    return "baz";
  };
});
Baz.included(null, function (this: any) {
  this.includedRan = true;
});
Baz.prepended(null, function (this: any) {
  this.prependedRan = true;
});
Baz.defineMethod("baz", function () {
  return "baz";
});

const Bar = newConcern();
include(Bar, Baz);
Bar.ClassMethods = {
  baz(this: any) {
    return "bar's baz + " + Baz.ClassMethods.baz.call(this);
  },
};
Bar.defineMethod("bar", function () {
  return "bar";
});
Bar.defineMethod("baz", function (this: any) {
  return "bar+" + Baz.instanceMethod("baz").value.call(this);
});

const Foo = newConcern();
include(Foo, Bar);
include(Foo, Baz);

const Qux: any = { ClassMethods: {} };

describe("ConcernTest", () => {
  let klass: any;

  beforeEach(() => {
    klass = class {};
  });

  it("module is included normally", () => {
    include(klass, Baz);
    expect(new klass().baz()).toEqual("baz");
    expect(includedModules(klass)).toContain(Baz);
  });

  it("module is prepended normally", () => {
    prepend(klass, Baz);
    expect(new klass().baz()).toEqual("baz");
    expect(includedModules(klass)).toContain(Baz);
  });

  it("class methods are extended", () => {
    include(klass, Baz);
    expect(klass.baz()).toEqual("baz");
    expect(includedModules({ prototype: klass })[0]).toEqual(Baz.ClassMethods);
  });

  it("class methods are extended when prepended", () => {
    prepend(klass, Baz);
    expect(klass.baz()).toEqual("baz");
    expect(includedModules({ prototype: klass })[0]).toEqual(Baz.ClassMethods);
  });

  it("class methods are extended only on expected objects", () => {
    include(Object, Qux);
    extend(Object, Qux.ClassMethods);
    const testModule = newConcern();
    testModule.classMethods((mod: Record<string, unknown>) => {
      mod.test = function () {};
    });
    include(klass, testModule);
    assertNotRespondTo(Object, "test");
    delete Qux.ClassMethods;
  });

  it("included block is ran", () => {
    include(klass, Baz);
    expect(klass.includedRan).toEqual(true);
  });

  it("included block is not ran when prepended", () => {
    prepend(klass, Baz);
    assertNil(klass.includedRan);
  });

  it("prepended block is ran", () => {
    prepend(klass, Baz);
    expect(klass.prependedRan).toEqual(true);
  });

  it("prepended block is not ran when included", () => {
    include(klass, Baz);
    assertNil(klass.prependedRan);
  });

  it("modules dependencies are met", () => {
    include(klass, Bar);
    expect(new klass().bar()).toEqual("bar");
    expect(new klass().baz()).toEqual("bar+baz");
    expect(klass.baz()).toEqual("bar's baz + baz");
    expect(includedModules(klass)).toContain(Bar);
  });

  it("dependencies with multiple modules", () => {
    include(klass, Foo);
    expect(includedModules(klass).slice(0, 3)).toEqual([Foo, Bar, Baz]);
  });

  it("dependencies with multiple modules when prepended", () => {
    prepend(klass, Foo);
    expect(includedModules(klass).slice(0, 3)).toEqual([Foo, Bar, Baz]);
  });

  it("raise on multiple included calls", async () => {
    await assertRaises([MultipleIncludedBlocks], {}, () => {
      const mod = newConcern();

      mod.included(null, () => {});

      mod.included(null, () => {
        return undefined;
      });
    });
  });

  it("raise on multiple prepended calls", async () => {
    await assertRaises([MultiplePrependBlocks], {}, () => {
      const mod = newConcern();

      mod.prepended(null, () => {});

      mod.prepended(null, () => {
        return undefined;
      });
    });
  });

  it("no raise on same included or prepended call", async () => {
    await assertNothingRaised(() => {
      const someConcern = newConcern();
      for (let i = 0; i < 2; i++) {
        someConcern.included(null, function () {});
        someConcern.prepended(null, function () {});
      }
    });
  });

  it("prepended and included methods", () => {
    const includedMod = newConcern();
    const prependedMod = newConcern();

    klass = class {
      "@foo": unknown[] = [];
    };
    includedMod.defineMethod("foo", function (this: any) {
      this["@foo"].push("included");
      return this["@foo"];
    });
    const classFoo = function (this: any) {
      includedMod.instanceMethod("foo").value.call(this);
      this["@foo"].push("class");
      return this["@foo"];
    };
    klass.prototype.foo = classFoo;
    prependedMod.defineMethod("foo", function (this: any) {
      classFoo.call(this);
      this["@foo"].push("prepended");
      return this["@foo"];
    });

    include(klass, includedMod);
    prepend(klass, prependedMod);

    expect(new klass().foo()).toEqual(["included", "class", "prepended"]);
  });

  it("prepended and included class methods", () => {
    const includedMod = newConcern();
    const prependedMod = newConcern();

    klass["@foo"] = [];
    includedMod.classMethods((mod: Record<string, unknown>) => {
      mod.foo = function (this: any) {
        this["@foo"].push("included");
        return this["@foo"];
      };
    });
    const classFoo = function (this: any) {
      includedMod.ClassMethods.foo.call(this);
      this["@foo"].push("class");
      return this["@foo"];
    };
    prependedMod.classMethods((mod: Record<string, unknown>) => {
      mod.foo = function (this: any) {
        classFoo.call(this);
        this["@foo"].push("prepended");
        return this["@foo"];
      };
    });

    include(klass, includedMod);
    klass.foo = classFoo;
    prepend(klass, prependedMod);

    expect(klass.foo()).toEqual(["included", "class", "prepended"]);
  });
});
