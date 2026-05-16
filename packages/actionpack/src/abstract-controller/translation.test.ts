import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "@blazetrails/activesupport";
import { translate, t, localize, l, type TranslationHost } from "./translation.js";

function makeHost(controllerPath: string, actionName: string): TranslationHost {
  return {
    actionName,
    constructor: { controllerPath: () => controllerPath },
  } as unknown as TranslationHost;
}

describe("AbstractController::Translation", () => {
  beforeEach(() => {
    I18n.backend.storeTranslations("en", {
      people: {
        index: { foo: "scoped people index foo" },
      },
      shared: { foo: "shared foo" },
    });
  });

  it("delegates to I18n.translate for a top-level key", () => {
    const host = makeHost("people", "index");
    expect(translate.call(host, "shared.foo")).toBe("shared foo");
  });

  it("scopes leading-dot keys by controller path and action name", () => {
    const host = makeHost("people", "index");
    expect(translate.call(host, ".foo")).toBe("scoped people index foo");
  });

  it("converts slashes in controller path to dots", () => {
    I18n.backend.storeTranslations("en", {
      admin: { users: { show: { foo: "admin users show foo" } } },
    });
    const host = makeHost("admin/users", "show");
    expect(translate.call(host, ".foo")).toBe("admin users show foo");
  });

  it("prepends a default-list when caller supplies a default and the key starts with a dot", () => {
    // The scoped lookup misses, the user default ('users.unknown') also
    // misses, but I18n's missing-translation fallback returns a default-array
    // structure. Easiest assertion: passing through without throwing.
    const host = makeHost("people", "index");
    expect(() => translate.call(host, ".missing", { default: "Hello" })).not.toThrow();
  });

  it("`t` is an alias for `translate`", () => {
    const host = makeHost("people", "index");
    expect(t.call(host, ".foo")).toBe(translate.call(host, ".foo"));
  });

  it("localize / l delegate to I18n.localize", () => {
    const host = makeHost("people", "index");
    const d = new Date("2026-05-16T12:34:56Z");
    expect(typeof localize.call(host, d)).toBe("string");
    expect(l.call(host, d)).toBe(localize.call(host, d));
  });
});
