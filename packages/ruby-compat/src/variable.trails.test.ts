import { afterEach, describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { include, Module, rbModConstSet } from "./include.js";
import { NameError } from "./name-error.js";
import { rbModName, rbModToS, rbSetClassPathString } from "./object.js";
import { TypeError } from "./type-error.js";
import {
  isRegisteredConstant,
  rbConstGet,
  rbModConstGet,
  rbModConstants,
  rbPathToClass,
  registerConstant,
  registeredConstant,
  unregisterConstant,
} from "./variable.js";

describe("rb_path_to_class", () => {
  class Widget {
    static Part = class Part {};
    static COUNT = 3;
  }
  class Gadget extends Widget {}
  const Shop = new Module();

  const seated: [string, unknown][] = [
    ["PathShop", Shop],
    ["PathShop::Widget", Widget],
    ["PathShop::Gadget", Gadget],
    ["PathLimit", 5],
    ["PathDepot::Aisle::Shelf", Gadget],
  ];
  for (const [name, value] of seated) registerConstant(name, value);
  afterEach(() => {
    for (const [name, value] of seated) registerConstant(name, value);
  });

  it("walks each :: segment from the Object table", () => {
    expect(rbPathToClass("PathShop")).toBe(Shop);
    expect(rbPathToClass("PathShop::Widget")).toBe(Widget);
  });

  it("reads a full path the table seats before walking its prefixes", () => {
    expect(rbPathToClass("PathDepot::Aisle::Shelf")).toBe(Gadget);
    expect(() => rbPathToClass("PathDepot::Aisle")).toThrow(
      new ArgumentError("undefined class/module PathDepot::"),
    );
  });

  it("reads a segment the table does not hold as a constant of the namespace before it", () => {
    expect(rbPathToClass("PathShop::Widget::Part")).toBe(Widget.Part);
  });

  it("does not search a namespace's ancestors", () => {
    expect(() => rbPathToClass("PathShop::Gadget::Part")).toThrow(
      new ArgumentError("undefined class/module PathShop::Gadget::Part"),
    );
  });

  it("raises ArgumentError naming the path up to the miss", () => {
    expect(() => rbPathToClass("PathNowhere")).toThrow(
      new ArgumentError("undefined class/module PathNowhere"),
    );
    expect(() => rbPathToClass("PathNowhere::Widget")).toThrow(
      new ArgumentError("undefined class/module PathNowhere::"),
    );
    expect(() => rbPathToClass("PathShop:Widget")).toThrow(
      new ArgumentError("undefined class/module PathShop"),
    );
    expect(() => rbPathToClass("::PathShop")).toThrow(
      new ArgumentError("undefined class/module ::"),
    );
  });

  it("does not read a JS global as a top-level constant", () => {
    expect(() => rbPathToClass("Array")).toThrow(new ArgumentError("undefined class/module Array"));
    expect(() => rbPathToClass("PathShop::Widget::name")).toThrow(
      new ArgumentError("undefined class/module PathShop::Widget::name"),
    );
  });

  it("raises TypeError for a constant that is not a class or module", () => {
    expect(() => rbPathToClass("PathLimit")).toThrow(
      new TypeError("PathLimit does not refer to class/module"),
    );
    expect(() => rbPathToClass("PathShop::Widget::COUNT")).toThrow(
      new TypeError("PathShop::Widget::COUNT does not refer to class/module"),
    );
  });

  it("refuses an empty or anonymous path", () => {
    expect(() => rbPathToClass("")).toThrow(new ArgumentError("can't retrieve anonymous class "));
    expect(() => rbPathToClass("#<Class:0x01>")).toThrow(
      new ArgumentError("can't retrieve anonymous class #<Class:0x01>"),
    );
  });
});

describe("the Object constant table", () => {
  class Seat {}
  class Pathed {}
  rbSetClassPathString(Pathed, { name: "Outer" }, "Pathed");
  const Hall = new Module();

  it("names a class or module that has no permanent classpath, as const_set does", () => {
    registerConstant("Table::Seat", Seat);
    registerConstant("Table::Hall", Hall);
    expect(isRegisteredConstant("Table::Seat")).toBe(true);
    expect(registeredConstant("Table::Seat")).toBe(Seat);
    expect(rbModName(Seat)).toBe("Table::Seat");
    expect(rbModToS(Seat)).toBe("Table::Seat");
    expect(Hall.name).toBe("Table::Hall");
    const Lobby = {};
    registerConstant("Table::Lobby", Lobby);
    expect(rbModName(Lobby as never)).toBe("Table::Lobby");
  });

  it("keeps the permanent classpath a class already has", () => {
    registerConstant("Table::Alias", Seat);
    registerConstant("Table::Pathed", Pathed);
    expect(rbModName(Seat)).toBe("Table::Seat");
    expect(rbModName(Pathed)).toBe("Outer::Pathed");
    expect(rbPathToClass("Table::Alias")).toBe(Seat);
  });

  it("unregisters only the value it was handed, and the class keeps its name", () => {
    unregisterConstant("Table::Seat", class Seat {});
    expect(isRegisteredConstant("Table::Seat")).toBe(true);
    unregisterConstant("Table::Seat", Seat);
    expect(isRegisteredConstant("Table::Seat")).toBe(false);
    expect(rbModName(Seat)).toBe("Table::Seat");
  });
});

describe("rb_const_get", () => {
  class Checks {}
  class LocalCheck {}
  class IncludedCheck {}
  class TopCheck {}
  rbModConstSet(Checks, "IncludedCheck", IncludedCheck);
  rbModConstSet(Checks, "LocalCheck", IncludedCheck);

  class Host {
    static LocalCheck = LocalCheck;
  }
  include(Host, Checks);
  class Sub extends Host {}

  afterEach(() => {
    unregisterConstant("ConstGetTopCheck", TopCheck);
    unregisterConstant("ConstGetSpace::TopCheck", TopCheck);
  });

  it("reads a constant off the class before its included modules", () => {
    expect(rbConstGet(Sub, "LocalCheck")).toBe(LocalCheck);
  });

  it("reads a constant seated on a module the class or a superclass includes", () => {
    expect(rbConstGet(Host, "IncludedCheck")).toBe(IncludedCheck);
    expect(rbConstGet(Sub, "IncludedCheck")).toBe(IncludedCheck);
  });

  it("falls through to the top-level table", () => {
    registerConstant("ConstGetTopCheck", TopCheck);
    expect(rbConstGet(Sub, "ConstGetTopCheck")).toBe(TopCheck);
  });

  it("raises NameError for a name nothing on the walk answers", () => {
    expect(() => rbConstGet(Sub, "ConstGetTopCheck")).toThrow(NameError);
  });

  describe("rb_mod_const_get", () => {
    class Outer {
      static Inner = class Inner {};
    }

    afterEach(() => {
      unregisterConstant("ConstGetOuter", Outer);
    });

    it("reads a seated path whole", () => {
      registerConstant("ConstGetSpace::TopCheck", TopCheck);
      expect(rbModConstGet(Sub, "ConstGetSpace::TopCheck")).toBe(TopCheck);
    });

    it("reads each later segment from the namespace before it", () => {
      registerConstant("ConstGetOuter", Outer);
      expect(rbModConstGet(Sub, "ConstGetOuter::Inner")).toBe(Outer.Inner);
      expect(rbModConstGet(Sub, "IncludedCheck")).toBe(IncludedCheck);
    });

    it("names the missing segment, not the path", () => {
      registerConstant("ConstGetOuter", Outer);
      let error: unknown;
      try {
        rbModConstGet(Sub, "ConstGetAbsent::Inner");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(NameError);
      expect((error as NameError).constantName).toBe("ConstGetAbsent");
      expect(() => rbModConstGet(Sub, "ConstGetOuter::Absent")).toThrow(
        "uninitialized constant Outer::Absent",
      );
    });
  });
});

describe("rb_mod_constants", () => {
  class Outer {
    static LIMIT = 1;
    static _memo = 2;
    static helper() {}
  }
  class Nested {}
  rbModConstSet(Outer, "Nested", Nested);
  class Child extends Outer {
    static Own = 3;
  }

  it("lists the constants seated on the class, not its other statics", () => {
    expect(rbModConstants(Outer)).toEqual(["LIMIT", "Nested"]);
  });

  it("includes the constants of an included module", () => {
    const Mixin = new Module();
    rbModConstSet(Mixin, "Mixed", class Mixed {});
    class Host extends Outer {}
    include(Host, Mixin);
    expect(rbModConstants(Host)).toEqual(["Mixed", "LIMIT", "Nested"]);
  });

  it("keeps to_s when inspect is overridden", () => {
    class Loud extends Module {
      override inspect(): string {
        return "loud";
      }
    }
    expect(rbModConstSet({ name: "ConstSpace" }, "Loud", new Loud()).toS()).toBe(
      "ConstSpace::Loud",
    );
  });

  it("renders a seated Module through to_s", () => {
    const mod = rbModConstSet({ name: "ConstSpace" }, "Seated", new Module());
    expect(mod.toS()).toBe("ConstSpace::Seated");
    expect(mod.toS()).toBe(mod.inspect());
  });

  it("includes the superclasses' constants", () => {
    expect(rbModConstants(Child)).toEqual(["Own", "LIMIT", "Nested"]);
    expect(rbModConstants(Nested)).toEqual([]);
  });
});
