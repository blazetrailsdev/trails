/**
 * Mirrors: i18n/test/i18n/interpolate_test.rb
 *
 * `RailsSafeBuffer` is a Ruby `String` subclass redefining `gsub`; the JS
 * `String` wrapper object is subclassable the same way, and `gsub` is
 * `replace`. `interpolate` is typed for the primitive because that is what
 * every trails caller hands it, so the two cases cast at the call site the way
 * Ruby's duck typing does implicitly.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as I18n from "./index.js";
import { ArgumentError, MissingInterpolationArgument, config } from "./index.js";
import type { MissingInterpolationArgumentHandler } from "./index.js";
import { inspect } from "./exceptions.js";
import { resetConfig } from "./i18n.js";
import { resetClassConfig } from "./config.js";

describe("I18nInterpolateTest", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
  });

  it("String interpolates a hash argument w/ named placeholders", () => {
    expect(I18n.interpolate("%{first} %{last}", { first: "Masao", last: "Mutoh" })).toBe(
      "Masao Mutoh",
    );
  });

  it("String interpolates a hash argument w/ named placeholders (reverse order)", () => {
    expect(I18n.interpolate("%{last}, %{first}", { first: "Masao", last: "Mutoh" })).toBe(
      "Mutoh, Masao",
    );
  });

  it("String interpolates named placeholders with sprintf syntax", () => {
    expect(I18n.interpolate("%<integer>d, %<float>.1f", { integer: 10, float: 43.4 })).toBe(
      "10, 43.4",
    );
  });

  it("String interpolates named placeholders with sprintf syntax, does not recurse", () => {
    expect(
      I18n.interpolate("%{msg}", {
        msg: "%<not_translated>s",
        not_translated: "should not happen",
      }),
    ).toBe("%<not_translated>s");
  });

  it("String interpolation does not replace anything when no placeholders are given", () => {
    expect(I18n.interpolate("aaa", { num: 1 })).toBe("aaa");
  });

  it("String interpolation sprintf behaviour equals Ruby 1.9 behaviour", () => {
    expect(I18n.interpolate("%<num>d", { num: 1 })).toBe("1");
    expect(I18n.interpolate("%<num>#b", { num: 1 })).toBe("0b1");
    expect(I18n.interpolate("%<msg>s", { msg: "foo" })).toBe("foo");
    expect(I18n.interpolate("%<num>f", { num: 1.0 })).toBe("1.000000");
    expect(I18n.interpolate("%<num>3.0f", { num: 1.0 })).toBe("  1");
    expect(I18n.interpolate("%<num>2.2f", { num: 100.0 })).toBe("100.00");
    expect(I18n.interpolate("%<num>#x", { num: 100.0 })).toBe("0x64");
    expect(() => I18n.interpolate("%<num>,d", { num: 100 })).toThrow(ArgumentError);
    expect(() => I18n.interpolate("%<num>/d", { num: 100 })).toThrow(ArgumentError);
  });

  it("String interpolation raises an I18n::MissingInterpolationArgument when the string has extra placeholders", () => {
    expect(() => I18n.interpolate("%{first} %{last}", { first: "Masao" })).toThrow(
      MissingInterpolationArgument,
    );
  });

  it("String interpolation does not raise when extra values were passed", () => {
    expect(() => {
      expect(
        I18n.interpolate("%{first} %{last}", { first: "Masao", last: "Mutoh", salutation: "Mr." }),
      ).toBe("Masao Mutoh");
    }).not.toThrow();
  });

  it("% acts as escape character in String interpolation", () => {
    expect(I18n.interpolate("%%{first}", { first: "Masao" })).toBe("%{first}");
    expect(I18n.interpolate("%% %<num>d", { num: 1.0 })).toBe("% 1");
    expect(I18n.interpolate("%%{num} %%<num>d", { num: 1 })).toBe("%{num} %<num>d");
  });

  it("sprintf mix unformatted and formatted named placeholders", () => {
    expect(I18n.interpolate("%{name} %<num>f", { name: "foo", num: 1.0 })).toBe("foo 1.000000");
  });

  class RailsSafeBuffer extends String {
    override replace: typeof String.prototype.replace = (searchValue, replaceValue) =>
      this.toString().replace(searchValue as string, replaceValue as string);
  }

  it("with String subclass that redefined gsub method", () => {
    expect(
      I18n.interpolate(new RailsSafeBuffer("Hello %{planet} world") as unknown as string, {
        planet: "mars",
      }),
    ).toBe("Hello mars world");
  });

  it("with String subclass that redefined gsub method returns same object if no interpolations", () => {
    const string = new RailsSafeBuffer("Hello world");
    expect(I18n.interpolate(string as unknown as string, { planet: "mars" })).toBe(
      string as unknown as string,
    );
  });
});

describe("I18nMissingInterpolationCustomHandlerTest", () => {
  let oldHandler: MissingInterpolationArgumentHandler;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    oldHandler = config().missingInterpolationArgumentHandler;
    config().missingInterpolationArgumentHandler = (key, values, string) =>
      `missing key is ${key.slice(1)}, values are ${inspect(values)}, given string is '${string}'`;
  });

  afterEach(() => {
    config().missingInterpolationArgumentHandler = oldHandler;
  });

  it("String interpolation can use custom missing interpolation handler", () => {
    expect(I18n.interpolate("%{first} %{last}", { first: "Masao" })).toBe(
      `Masao missing key is last, values are ${inspect({ first: "Masao" })}, given string is '%{first} %{last}'`,
    );
  });
});

describe("I18nCustomInterpolationPatternTest", () => {
  let oldInterpolationPatterns: RegExp[];

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    oldInterpolationPatterns = config().interpolationPatterns;
    config().interpolationPatterns.push(/\{\{(\w+)\}\}/);
  });

  afterEach(() => {
    config().interpolationPatterns = oldInterpolationPatterns;
  });

  it("String interpolation can use custom interpolation pattern", () => {
    expect(I18n.interpolate("{{first}} {{last}}", { first: "Masao", last: "Mutoh" })).toBe(
      "Masao Mutoh",
    );
  });
});
