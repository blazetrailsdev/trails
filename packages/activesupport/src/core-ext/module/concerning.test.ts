import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { includedModules, prepend, publicInstanceMethods } from "@blazetrails/ruby-compat/include";
import { concern, concerning } from "./concerning.js";
import {
  assert,
  assertNot,
  assertNotRespondTo,
  assertRespondTo,
} from "../../testing/assertions.js";

const ModuleConcernTest = {};

describe("ModuleConcerningTest", () => {
  it("concerning declares a concern and includes it immediately", () => {
    let klass: any = class {};
    concerning.call(klass, "Foo", {}, () => {});
    expect(includedModules(klass)).toContain(klass.Foo);

    klass = class {};
    concerning.call(klass, "Foo", { prepend: true }, () => {});
    expect(includedModules(klass)).toContain(klass.Foo);
  });

  it("concerning can prepend concern", () => {
    const klass: any = class {
      hi() {
        return "self";
      }
    };
    const hi = klass.prototype.hi;

    concerning.call(klass, "Foo", { prepend: true }, (mod) => {
      mod.defineMethod("hi", function (this: any) {
        return `hello, ${hi.call(this)}`;
      });
    });

    expect(new klass().hi()).toEqual("hello, self");
  });
});

describe("ModuleConcernTest", () => {
  it("concern creates a module extended with active support concern", () => {
    const klass: any = class {};
    concern.call(klass, "Baz", (mod: any) => {
      mod.included(null, function (this: any) {
        this["@foo"] = 1;
      });
      mod.prepended(null, function (this: any) {
        this["@foo"] = 2;
      });
      mod.defineMethod("shouldBePublic", function () {});
    });

    assert(Object.prototype.hasOwnProperty.call(klass, "Baz"));
    assertNot(Object.prototype.hasOwnProperty.call(ModuleConcernTest, "Baz"));
    expect(klass.Baz.appendFeatures).toBeInstanceOf(Function);
    expect(includedModules(klass)).not.toContain(klass.Baz);

    expect(publicInstanceMethods(klass.Baz).map(String)).toContain("shouldBePublic");

    const includer: any = class {};
    include(includer, klass.Baz);
    expect(includer["@foo"]).toEqual(1);

    const prepender: any = class {};
    prepend(prepender, klass.Baz);
    expect(prepender["@foo"]).toEqual(2);
  });

  const Foo: any = class {};
  concerning.call(Foo, "Bar", {}, (mod: any) => {
    mod.ClassMethods = {
      willBeOrphaned() {},
    };
    Foo.ClassMethods = mod.ClassMethods;

    mod.ClassMethods = {
      hackedOn() {},
    };

    mod.classMethods((classMethods: Record<string, unknown>) => {
      classMethods.nicerDsl = function () {};
    });

    mod.classMethods((classMethods: Record<string, unknown>) => {
      classMethods.doesntClobber = function () {};
    });
  });
  const orphanedClassMethods = Foo.ClassMethods;

  concerning.call(Foo, "Baz", { prepend: true }, (mod: any) => {
    orphanedClassMethods.willBeOrphanedAlso = function () {};

    mod.ClassMethods = {
      hackedOnAlso() {},
    };

    mod.classMethods((classMethods: Record<string, unknown>) => {
      classMethods.nicerDslAlso = function () {};
    });

    mod.classMethods((classMethods: Record<string, unknown>) => {
      classMethods.doesntClobberAlso = function () {};
    });
  });

  it("using class methods blocks instead of ClassMethods module", () => {
    assertNotRespondTo(Foo, "willBeOrphaned");
    assertRespondTo(Foo, "hackedOn");
    assertRespondTo(Foo, "nicerDsl");
    assertRespondTo(Foo, "doesntClobber");

    assert(Object.prototype.hasOwnProperty.call(Foo, "ClassMethods"));
    assert("willBeOrphaned" in Foo.ClassMethods);
  });

  it("using class methods blocks instead of ClassMethods module prepend", () => {
    assertNotRespondTo(Foo, "willBeOrphanedAlso");
    assertRespondTo(Foo, "hackedOnAlso");
    assertRespondTo(Foo, "nicerDslAlso");
    assertRespondTo(Foo, "doesntClobberAlso");

    assert(Object.prototype.hasOwnProperty.call(Foo, "ClassMethods"));
    assert("willBeOrphanedAlso" in Foo.ClassMethods);
  });
});
