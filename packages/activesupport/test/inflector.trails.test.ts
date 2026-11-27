import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { NotImplementedError } from "@blazetrails/ruby-compat/not-implemented-error";
import { StopIteration } from "@blazetrails/ruby-compat/stop-iteration";
import { constantize, safeConstantize } from "../lib/inflector.js";
import { Inflections } from "../lib/inflector/inflections.js";
import { constSet, constDefined } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { rbModRemoveConst } from "@blazetrails/ruby-compat/variable";

declare module "@blazetrails/ruby-compat/object" {
  interface ConstantTable {
    "Typed::Literal": typeof Date;
  }
}

describe("constantize types a literal through ConstantTable", () => {
  it("answers the table's class for a literal and unknown otherwise", () => {
    expectTypeOf(constantize<"Typed::Literal">).returns.toEqualTypeOf<typeof Date>();
    expectTypeOf(constantize("Date" as string)).toBeUnknown();
    expect(constantize("Object")).toBe(Object);
  });
});

describe("constantize resolves core exception classes", () => {
  it("answers ruby-compat's NotImplementedError", () => {
    expect(constantize("NotImplementedError")).toBe(NotImplementedError);
    expect(constantize("::NameError")).toBe(NameError);
    expect(constantize("StopIteration")).toBe(StopIteration);
  });
});

describe("constantize walks seated constants like Object.const_get", () => {
  const Bar = {};
  const Foo: Record<string, unknown> = {};

  afterEach(() => {
    if (constDefined(Object, "Foo", false)) rbModRemoveConst(Object, "Foo");
  });

  it("resolves a nested constant seated on a registered namespace", () => {
    constSet(TopLevel, "Foo", Foo);
    constSet(Foo, "Bar", Bar);
    expect(constantize("Foo::Bar")).toBe(Bar);
  });

  it("names only the path up to the unresolved segment", () => {
    constSet(TopLevel, "Foo", Foo);
    constSet(Foo, "Bar", Bar);
    let error: unknown;
    try {
      constantize("Foo::Bar::Baz::Qux");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(NameError);
    expect((error as NameError).message).toBe("uninitialized constant Foo::Bar::Baz");
    expect((error as NameError).constantName).toBe("Baz");
    expect((error as NameError).receiver()).toBe(Bar);
  });

  it("sends const_missing to the namespace a segment missed on", () => {
    const Baz = {};
    const Host = { constMissing: (name: string) => (name === "Baz" ? Baz : undefined) };
    constSet(TopLevel, "Foo", Host);
    try {
      expect(constantize("Foo::Baz")).toBe(Baz);
    } finally {
      if (constDefined(Object, "Foo", false)) rbModRemoveConst(Object, "Foo");
    }
  });

  it("lets a NameError raised inside const_missing escape safe_constantize", () => {
    const Host = {
      constMissing: () => {
        throw new NameError("undefined local variable or method 'oops' for main:Object", "oops");
      },
    };
    constSet(TopLevel, "Foo", Host);
    try {
      expect(() => safeConstantize("Foo::Baz")).toThrow(/oops/);
    } finally {
      if (constDefined(Object, "Foo", false)) rbModRemoveConst(Object, "Foo");
    }
  });
});

describe("Inflections#irregular emits inflections.rb's singular rules", () => {
  const singularize = (inflect: Inflections, word: string) => {
    const rule = inflect.singulars.find(({ rule }) => rule.test(word));
    return rule ? word.replace(rule.rule, rule.replacement) : word;
  };

  it("keeps an already-singular word when the first letters share case", () => {
    const inflect = new Inflections();
    inflect.irregular("cactus", "cacti");
    expect(inflect.singulars.map(({ rule }) => rule.source)).toEqual(["(c)acti$", "(c)actus$"]);
    expect(singularize(inflect, "cactus")).toBe("cactus");
    expect(singularize(inflect, "Cacti")).toBe("Cactus");
  });

  it("keeps an already-singular word when the first letters differ", () => {
    const inflect = new Inflections();
    inflect.irregular("ox", "boxen");
    expect(inflect.singulars).toHaveLength(4);
    expect(singularize(inflect, "Ox")).toBe("Ox");
    expect(singularize(inflect, "ox")).toBe("ox");
    expect(singularize(inflect, "boxen")).toBe("ox");
  });
});

describe("acronym regexes group the joined acronyms as Ruby's interpolated Regexp does", () => {
  it("binds the lookahead to every acronym, not only the last", () => {
    const inflect = new Inflections();
    inflect.acronym("API");
    inflect.acronym("HTML");
    expect("APIary".replace(inflect.acronymsCamelizeRegex, (m) => m.toLowerCase())).toBe("aPIary");
    expect("HTMLParser".replace(inflect.acronymsUnderscoreRegex, "$2_")).toBe("HTML_Parser");
    expect("APIary".replace(inflect.acronymsUnderscoreRegex, "$2_")).toBe("APIary");
  });
});
