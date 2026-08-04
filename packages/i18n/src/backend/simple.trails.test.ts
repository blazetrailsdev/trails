/**
 * Trails-only cover for the shape of `Simple` — the gem has no test for it
 * because Ruby's `class Simple; include Implementation` needs none.
 */

import { describe, expect, it } from "vitest";

import { Base } from "./base.js";
import { Simple } from "./simple.js";

describe("Backend::Simple", () => {
  it("includes Base rather than inheriting from it", () => {
    expect(Object.getPrototypeOf(Simple)).not.toBe(Base);
    expect(new Simple()).not.toBeInstanceOf(Base);
    // `include Base` (simple.rb:22) still puts every Base method on it.
    expect(typeof new Simple().translate).toBe("function");
    expect(typeof new Simple().transliterate).toBe("function");
  });

  it("keeps the seam a mixin sits in, with super reaching Simple's bodies", () => {
    // The gem's own example: `I18n::Backend::Simple.include(Pluralization)`
    // overrides a method and calls `super` (simple.rb:10-19).
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
});
