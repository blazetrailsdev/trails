import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { ArgumentError } from "../argument-error.js";
import { rbModName } from "../object.js";
import { Psych } from "../psych.js";
import { yaml } from "../psych-adapter.js";
import { Range } from "../range.js";
import { RuntimeError } from "../runtime-error.js";
import { registerConstant, unregisterConstant } from "../variable.js";

class Widget {}
class Point {}

function visit(visitor: InstanceType<typeof Psych.Visitors.ToRuby>, source: string): unknown {
  return visitor.accept(yaml.parseDocument(source).contents as never);
}

function restricted(classes: string[], symbols: string[], aliases = false) {
  const classLoader = new Psych.ClassLoader.Restricted(classes, symbols);
  const scanner = new Psych.ScalarScanner(classLoader);
  const klass = aliases ? Psych.Visitors.ToRuby : Psych.Visitors.NoAliasRuby;
  return new klass(scanner, classLoader);
}

describe("Psych::ClassLoader", () => {
  beforeEach(() => {
    registerConstant("LoaderWidget", Widget);
    registerConstant("Struct::LoaderPoint", Point);
  });

  afterEach(() => {
    unregisterConstant("LoaderWidget", Widget);
    unregisterConstant("Struct::LoaderPoint", Point);
  });

  it("names Psych's constants", () => {
    expect(Psych.ClassLoader.BIG_DECIMAL).toBe("BigDecimal");
    expect(Psych.ClassLoader.PSYCH_OMAP).toBe("Psych::Omap");
    expect(Psych.ClassLoader.SYMBOL).toBe("Symbol");
  });

  it("load answers nil for a nil or empty name", () => {
    const loader = new Psych.ClassLoader();
    expect(loader.load(null)).toBeNull();
    expect(loader.load("")).toBeNull();
  });

  it("load resolves a class through path2class", () => {
    expect(new Psych.ClassLoader().load("LoaderWidget")).toBe(Widget);
  });

  it("load retries under Struct:: and re-raises the first error", () => {
    const loader = new Psych.ClassLoader();
    expect(loader.load("LoaderPoint")).toBe(Point);
    expect(() => loader.load("LoaderNowhere")).toThrow(
      new ArgumentError("undefined class/module LoaderNowhere"),
    );
  });

  it("generates a reader per constant", () => {
    const loader = new Psych.ClassLoader();
    expect(loader.range()).toBe(Range);
    expect(loader.regexp()).toBe(RegExp);
    expect(loader.object()).toBe(Object);
    expect(loader.exception()).toBe(Error);
    expect(() => loader.psychOmap()).toThrow(new ArgumentError("undefined class/module Psych::"));
    expect(() => loader.bigDecimal()).toThrow(ArgumentError);
  });

  it("symbolize answers the Symbol", () => {
    expect(new Psych.ClassLoader().symbolize("foo")).toBe(":foo");
  });
});

describe("Psych::ClassLoader::Restricted", () => {
  beforeEach(() => registerConstant("LoaderWidget", Widget));
  afterEach(() => unregisterConstant("LoaderWidget", Widget));

  it("loads a permitted class by its name", () => {
    const loader = new Psych.ClassLoader.Restricted([rbModName(Widget)!], []);
    expect(loader.load("LoaderWidget")).toBe(Widget);
  });

  it("raises DisallowedClass for a class outside permitted_classes", () => {
    const loader = new Psych.ClassLoader.Restricted([], []);
    expect(() => loader.load("LoaderWidget")).toThrow(Psych.DisallowedClass);
    expect(() => loader.load("LoaderWidget")).toThrow(
      "Tried to load unspecified class: LoaderWidget",
    );
    expect(() => loader.range()).toThrow("Tried to load unspecified class: Range");
  });

  it("raises DisallowedClass for Symbol when Symbol is not permitted", () => {
    const loader = new Psych.ClassLoader.Restricted([], []);
    expect(() => loader.symbolize("foo")).toThrow("Tried to load unspecified class: Symbol");
  });

  it("permits every Symbol when permitted_symbols is empty", () => {
    expect(new Psych.ClassLoader.Restricted(["Symbol"], []).symbolize("foo")).toBe(":foo");
  });

  it("raises DisallowedClass for a Symbol outside permitted_symbols", () => {
    const loader = new Psych.ClassLoader.Restricted(["Symbol"], ["foo"]);
    expect(loader.symbolize("foo")).toBe(":foo");
    expect(() => loader.symbolize("bar")).toThrow(Psych.DisallowedClass);
    expect(() => loader.symbolize("bar")).toThrow("Tried to load unspecified class: Symbol");
  });

  it("is threaded through ToRuby and ScalarScanner", () => {
    expect(
      visit(restricted(["LoaderWidget"], []), "--- !ruby/object:LoaderWidget {}"),
    ).toBeInstanceOf(Widget);
    expect(() => visit(restricted([], []), "--- !ruby/object:LoaderWidget {}")).toThrow(
      "Tried to load unspecified class: LoaderWidget",
    );
    expect(() => visit(restricted([], []), "--- :foo")).toThrow(
      "Tried to load unspecified class: Symbol",
    );
    expect(() => visit(restricted([], []), "--- !ruby/symbol foo")).toThrow(Psych.DisallowedClass);
    expect(visit(restricted(["Symbol"], ["foo"]), "--- [:foo, :'foo']")).toEqual([":foo", ":foo"]);
    expect(() => visit(restricted([], []), "--- !ruby/range 1..2")).toThrow(
      "Tried to load unspecified class: Range",
    );
  });
});

describe("Psych alias exceptions", () => {
  it("NoAliasRuby raises AliasesNotEnabled for an alias", () => {
    const load = () => visit(restricted([], []), "---\n- &a x\n- *a\n");
    expect(load).toThrow(Psych.AliasesNotEnabled);
    expect(load).toThrow(
      "Alias parsing was not enabled. To enable it, pass `aliases: true` to `Psych::load` or `Psych::safe_load`.",
    );
    expect(visit(restricted([], [], true), "---\n- &a x\n- *a\n")).toEqual(["x", "x"]);
  });

  it("ToRuby raises AnchorNotDefined for an unknown anchor", () => {
    const load = () => Psych.unsafeLoad("---\n- *missing\n");
    expect(load).toThrow(Psych.AnchorNotDefined);
    expect(load).toThrow("An alias referenced an unknown anchor: missing");
  });

  it("the alias exceptions are BadAlias, and BadAlias is a Psych::Exception", () => {
    expect(new Psych.AliasesNotEnabled()).toBeInstanceOf(Psych.BadAlias);
    expect(new Psych.AnchorNotDefined("a")).toBeInstanceOf(Psych.BadAlias);
    expect(new Psych.BadAlias("Tried to dump an aliased object")).toBeInstanceOf(Psych.Exception);
    expect(new Psych.DisallowedClass("load", "Foo")).toBeInstanceOf(RuntimeError);
    expect(new Psych.AnchorNotDefined("a").name).toBe("Psych::AnchorNotDefined");
  });
});
