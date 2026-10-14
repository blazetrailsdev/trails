import { describe, expect, it } from "vitest";
import { registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";
import { isAnonymous } from "../../module-ext.js";

describe("Module#anonymous? for a JS class (anonymous.rb:27-29)", () => {
  it("names a class its own definition names, whatever the spelling", () => {
    class Foo {}
    class _Foo {}
    class $Foo {}
    class lower {}
    const Bar = class Baz {};
    for (const klass of [Foo, _Foo, $Foo, lower, Bar]) expect(isAnonymous(klass)).toBe(false);
  });

  it("names an identifier-less class assigned to a constant name, as Foo = Class.new does", () => {
    const PostsController = class {};
    const Sub = class extends PostsController {};
    expect(isAnonymous(PostsController)).toBe(false);
    expect(isAnonymous(Sub)).toBe(false);
  });

  it("leaves an identifier-less class assigned to a local anonymous, as klass = Class.new does", () => {
    const klass = class {};
    const sub = class extends klass {};
    const commented = new Function(
      "klass",
      "const commented = class /* c */ extends klass {}; return commented;",
    )(klass);
    const _Foo = class {};
    for (const k of [klass, sub, commented, _Foo]) expect(isAnonymous(k)).toBe(true);
  });

  it("reads a name written onto an identifier-less class by the same rule", () => {
    const klass = class {};
    Object.defineProperty(klass, "name", { value: "Fun::GamesController" });
    expect(isAnonymous(klass)).toBe(false);
    Object.defineProperty(klass, "name", { value: "games" });
    expect(isAnonymous(klass)).toBe(true);
  });

  it("names a class a constant seat paths", () => {
    const klass = class {};
    registerConstant("AnonymousTrailsTest::Seated", klass);
    try {
      expect(isAnonymous(klass)).toBe(false);
    } finally {
      unregisterConstant("AnonymousTrailsTest::Seated", klass);
    }
  });

  it("answers a plain-object module by its name", () => {
    expect(isAnonymous({ name: "ActionController" })).toBe(false);
    expect(isAnonymous({ name: "" })).toBe(true);
  });
});
