import { afterEach, expect, it, vi } from "vitest";
import {
  availableLocales,
  config,
  exists,
  reloadBang,
  setAvailableLocales,
  t,
} from "../../../lib/i18n.js";

export function testsBasics(): void {
  afterEach(() => {
    setAvailableLocales(null);
  });

  it("available_locales returns the available_locales produced by the backend, by default", () => {
    config().backend.storeTranslations("de", { foo: "bar" });
    config().backend.storeTranslations("en", { foo: "foo" });

    expect(availableLocales()).toEqual(config().backend.availableLocales());
  });

  it("available_locales can be set to something else independently from the actual locale data", () => {
    config().backend.storeTranslations("de", { foo: "bar" });
    config().backend.storeTranslations("en", { foo: "foo" });

    setAvailableLocales("foo");
    expect(availableLocales()).toEqual(["foo"]);

    setAvailableLocales(["foo", "bar"]);
    expect(availableLocales()).toEqual(["foo", "bar"]);

    setAvailableLocales(null);
    expect(availableLocales()).toEqual(config().backend.availableLocales());
  });

  it("available_locales memoizes when set explicitly", async () => {
    const spy = vi.spyOn(config().backend, "availableLocales");
    setAvailableLocales(["foo"]);
    config().backend.storeTranslations("de", { bar: "baz" });
    await reloadBang();
    expect(availableLocales()).toEqual(["foo"]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("available_locales delegates to the backend when not set explicitly", () => {
    const originalAvailableLocalesValue = config().backend.availableLocales();
    const spy = vi
      .spyOn(config().backend, "availableLocales")
      .mockReturnValue(originalAvailableLocalesValue);
    expect(availableLocales()).toEqual(config().backend.availableLocales());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("exists? is implemented by the backend", () => {
    config().backend.storeTranslations("foo", { bar: "baz" });
    expect(exists("bar", "foo")).toBeTruthy();
  });

  it("storing a nil value as a translation removes it from the available locale data", () => {
    config().backend.storeTranslations("en", { to_be_deleted: "bar" });
    expect(t("to_be_deleted", { default: "baz" })).toBe("bar");

    config().backend.storeTranslations("en", { to_be_deleted: null });
    expect(t("to_be_deleted", { default: "baz" })).toBe("baz");
  });
}
