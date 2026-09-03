import { describe, expect, it } from "vitest";

import { Base } from "./base.js";
import { Simple } from "./simple.js";

describe("Backend::Simple", () => {
  it("includes Base rather than inheriting from it", () => {
    expect(Object.getPrototypeOf(Simple)).not.toBe(Base);
    expect(new Simple()).not.toBeInstanceOf(Base);
    expect(typeof new Simple().translate).toBe("function");
    expect(typeof new Simple().transliterate).toBe("function");
  });

  it("keeps the seam a mixin sits in, with super reaching Simple's bodies", () => {
    const seen: string[] = [];
    class Pluralization extends Simple {
      override storeTranslations(
        locale: string,
        data: Record<string, unknown>,
        options = {},
      ): unknown {
        seen.push(locale);
        return super.storeTranslations(locale, data, options);
      }
    }

    const backend = new Pluralization();
    backend.storeTranslations("en", { foo: "bar" });

    expect(seen).toEqual(["en"]);
    expect(backend.translate("en", "foo")).toBe("bar");
  });

  it("stores a Symbol-spelled locale in the same bucket as its String form", () => {
    const backend = new Simple();
    backend.storeTranslations(":en", { foo: "bar" });
    backend.storeTranslations("en", { baz: "baz" });

    expect(backend.translations()).toEqual({ en: { foo: "bar", baz: "baz" } });
  });

  it("looks a Symbol-spelled key up in the same entry as its String form", () => {
    const backend = new Simple();
    backend.storeTranslations("en", { foo: { bar: "baz" } });

    expect(backend.translate("en", "foo.bar")).toBe("baz");
    expect(backend.translate(":en", ":foo.bar")).toBe("baz");
  });

  it("stores the caller's own subtree when skipSymbolizeKeys is set", () => {
    const backend = new Simple();
    const data = { foo: { bar: "barfr", baz: "bazfr" } };
    backend.storeTranslations("fr", data, { skipSymbolizeKeys: true });

    expect((backend.translations()["fr"] as Record<string, unknown>)["foo"]).toBe(data.foo);
  });

  it("does not vivify a locale for the property reads JSON.stringify makes", () => {
    const backend = new Simple();
    backend.storeTranslations("en", { foo: { bar: "baz" } });

    expect(JSON.stringify(backend.translations())).toBe('{"en":{"foo":{"bar":"baz"}}}');
    expect(backend.translations()["fr"]).toEqual({});
    expect(Object.keys(backend.translations())).toEqual(["en", "fr"]);
  });
});
