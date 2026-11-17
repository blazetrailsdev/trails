import { beforeEach, expect, it } from "vitest";
import { MissingTranslationData } from "../../../lib/exceptions.js";
import { config, t } from "../../../lib/i18n.js";

export function testsDefaults(): void {
  beforeEach(() => {
    config().backend.storeTranslations("en", { foo: { bar: "bar", baz: "baz" } });
  });

  it("defaults: given nil as a key it returns the given default", () => {
    expect(t(null, { default: "default" })).toBe("default");
  });

  it("defaults: given a symbol as a default it translates the symbol", () => {
    expect(t(null, { default: ":foo.bar" })).toBe("bar");
  });

  it("defaults: given a symbol as a default and a scope it stays inside the scope when looking up the symbol", () => {
    expect(t("missing", { default: ":bar", scope: "foo" })).toBe("bar");
  });

  it("defaults: given an array as a default it returns the first match", () => {
    expect(t("does_not_exist", { default: [":does_not_exist_2", ":foo.bar"] })).toBe("bar");
  });

  it("defaults: given an array as a default with false it returns false", () => {
    expect(t("does_not_exist", { default: [false] })).toBe(false);
  });

  it("defaults: given false it returns false", () => {
    expect(t("does_not_exist", { default: false })).toBe(false);
  });

  it("defaults: given nil it returns nil", () => {
    expect(t("does_not_exist", { default: null })).toBeNull();
  });

  it("defaults: given an array of missing keys it raises a MissingTranslationData exception", () => {
    expect(() =>
      t("does_not_exist", {
        default: [":does_not_exist_2", ":does_not_exist_3"],
        raise: true,
      }),
    ).toThrow(MissingTranslationData);
  });

  it("defaults: using a custom scope separator", () => {
    config().backend.storeTranslations("en", { foo: { bar: "bar" } }, { separator: "|" });
    expect(t(null, { default: ":foo|bar", separator: "|" })).toBe("bar");
  });

  it("defaults: only interpolates once when resolving defaults", () => {
    config().backend.storeTranslations("en", { greeting: "hey %{name}" });
    expect(t("does_not_exist", { name: "%{dont_interpolate_me}", default: [":greeting"] })).toBe(
      "hey %{dont_interpolate_me}",
    );
  });
}
