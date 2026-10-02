import { afterAll, describe, expect, it } from "vitest";
import { include, Module, registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";
import { TestCase } from "../test-case.js";
import { ClassMethods, ConstantLookup } from "./constant-lookup.js";

class Foo {}
class Bar extends Foo {
  index(): void {}
  static index(): void {}
}
const FooBar = new Module();

registerConstant("Foo", Foo);
registerConstant("Bar", Bar);
registerConstant("FooBar", FooBar);

class ConstantLookupTest extends TestCase {
  declare static determineConstantFromTestName: (typeof ClassMethods)["determineConstantFromTestName"];

  findFoo(name: string): unknown {
    return (this.constructor as typeof ConstantLookupTest).determineConstantFromTestName(
      name,
      (constant) => typeof constant === "function" && constant.prototype instanceof Foo,
    );
  }

  findModule(name: string): unknown {
    return (this.constructor as typeof ConstantLookupTest).determineConstantFromTestName(
      name,
      (constant) => constant instanceof Module,
    );
  }
}
include(ConstantLookupTest, ConstantLookup);

describe("ConstantLookupTest", () => {
  afterAll(() => {
    unregisterConstant("Foo", Foo);
    unregisterConstant("Bar", Bar);
    unregisterConstant("FooBar", FooBar);
  });

  it("find bar from foo", ({ task }) => {
    const test = new ConstantLookupTest(task.name);
    expect(test.findFoo("Bar")).toBe(Bar);
    expect(test.findFoo("Bar::index")).toBe(Bar);
    expect(test.findFoo("Bar::index::authenticated")).toBe(Bar);
    expect(test.findFoo("BarTest")).toBe(Bar);
    expect(test.findFoo("BarTest::index")).toBe(Bar);
    expect(test.findFoo("BarTest::index::authenticated")).toBe(Bar);
  });

  it("find module", ({ task }) => {
    const test = new ConstantLookupTest(task.name);
    expect(test.findModule("FooBar")).toBe(FooBar);
    expect(test.findModule("FooBar::index")).toBe(FooBar);
    expect(test.findModule("FooBar::index::authenticated")).toBe(FooBar);
    expect(test.findModule("FooBarTest")).toBe(FooBar);
    expect(test.findModule("FooBarTest::index")).toBe(FooBar);
    expect(test.findModule("FooBarTest::index::authenticated")).toBe(FooBar);
  });

  it("returns nil when cant find foo", ({ task }) => {
    const test = new ConstantLookupTest(task.name);
    expect(test.findFoo("DoesntExist")).toBeNull();
    expect(test.findFoo("DoesntExistTest")).toBeNull();
    expect(test.findFoo("DoesntExist::Nadda")).toBeNull();
    expect(test.findFoo("DoesntExist::Nadda::Nope")).toBeNull();
    expect(test.findFoo("DoesntExist::Nadda::Nope::NotHere")).toBeNull();
  });

  it("returns nil when cant find module", ({ task }) => {
    const test = new ConstantLookupTest(task.name);
    expect(test.findModule("DoesntExist")).toBeNull();
    expect(test.findModule("DoesntExistTest")).toBeNull();
    expect(test.findModule("DoesntExist::Nadda")).toBeNull();
    expect(test.findModule("DoesntExist::Nadda::Nope")).toBeNull();
    expect(test.findModule("DoesntExist::Nadda::Nope::NotHere")).toBeNull();
  });

  it.skip("does not shallow ordinary exceptions");
});
