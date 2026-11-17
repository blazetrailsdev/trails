import { beforeEach, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { MissingTranslationData } from "../../../lib/exceptions.js";
import { config, t } from "../../../lib/i18n.js";

export function testsLookup(): void {
  beforeEach(() => {
    config().backend.storeTranslations("en", {
      foo: { bar: "bar", baz: "baz" },
      falsy: false,
      truthy: true,
      string: "a",
      array: ["a", "b", "c"],
      hash: { a: "b" },
    });
  });

  it("lookup: it returns a string", () => {
    expect(t("string")).toBe("a");
  });

  it("lookup: it returns hash", () => {
    expect(t("hash")).toEqual(new Hash().set(":a", "b"));
  });

  it("lookup: it returns an array", () => {
    expect(t("array")).toEqual(["a", "b", "c"]);
  });

  it("lookup: it returns a native true", () => {
    expect(t("truthy") === true).toBeTruthy();
  });

  it("lookup: it returns a native false", () => {
    expect(t("falsy") === false).toBeTruthy();
  });

  it("lookup: given a missing key, no default and no raise option it returns an error message", () => {
    expect(t("missing")).toBe("Translation missing: en.missing");
  });

  it("lookup: given a missing key, no default and the raise option it raises MissingTranslationData", () => {
    expect(() => t("missing", { raise: true })).toThrow(MissingTranslationData);
  });

  it("lookup: does not raise an exception if no translation data is present for the given locale", () => {
    expect(() => t("foo", { locale: "xx" })).not.toThrow();
  });

  it("lookup: does not modify the options hash", () => {
    const options = {};
    expect(t("string", options)).toBe("a");
    expect(options).toEqual({});
    expect(() => t("string", Object.freeze(options))).not.toThrow();
  });

  it("lookup: given an array of keys it translates all of them", () => {
    expect(t(["bar", "baz"], { scope: ["foo"] })).toEqual(["bar", "baz"]);
  });

  it("lookup: using a custom scope separator", () => {
    config().backend.storeTranslations("en", { foo: { bar: "bar" } }, { separator: "|" });
    expect(t("foo|bar", { separator: "|" })).toBe("bar");
  });

  it("lookup: given nil as a locale it does not raise but use the default locale", () => {
    expect(() => t("bar", { locale: null })).not.toThrow();
  });

  // PERMANENT-SKIP: CLAUDE.md, "Ruby Strings are JS string primitives (no mutable String carrier)".
  it.skip("lookup: a resulting String is not frozen", () => {
    expect(Object.isFrozen(t("string"))).toBe(false);
  });

  it("lookup: a resulting Array is not frozen", () => {
    expect(!Object.isFrozen(t("array"))).toBeTruthy();
  });

  it("lookup: a resulting Hash is not frozen", () => {
    expect(!Object.isFrozen(t("hash"))).toBeTruthy();
  });

  it("lookup: only interpolates once when resolving symbols", () => {
    config().backend.storeTranslations("en", { foo: ":bar", bar: "%{value}" });
    expect(t("foo", { value: "%{dont_interpolate_me}" })).toBe("%{dont_interpolate_me}");
  });
}
