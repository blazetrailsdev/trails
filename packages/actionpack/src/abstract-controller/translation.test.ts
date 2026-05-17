import { beforeEach, describe, expect, it } from "vitest";
import { I18n } from "@blazetrails/activesupport";
import {
  l,
  localize,
  t,
  translate,
  type LocalizeOptions,
  type TranslateOptions,
  type TranslationHost,
} from "./translation.js";

// ==========================================================================
// abstract/translation_test.rb
// ==========================================================================

// Rails: `TranslationController < AbstractController::Base; include
// AbstractController::Translation; end`. trails' translate/t/localize/l
// are `this`-typed standalone functions — wire them onto a class
// prototype here so the `respond_to` Rails tests have something to
// observe.
// `TranslationHost.constructor` is typed `{ controllerPath(): string }`
// — JS classes have `constructor: Function` by default, so we cast at
// the call sites rather than fight the `implements` clause.
class TranslationController {
  static controllerPath(): string {
    return "abstract_controller/testing/translation";
  }
  actionName = "";
  translate(key: string, options: TranslateOptions = {}): unknown {
    return translate.call(this as unknown as TranslationHost, key, options);
  }
  t(key: string, options: TranslateOptions = {}): unknown {
    return t.call(this as unknown as TranslationHost, key, options);
  }
  localize(object: Date, options: LocalizeOptions = {}): string {
    return localize.call(this as unknown as TranslationHost, object, options);
  }
  l(object: Date, options: LocalizeOptions = {}): string {
    return l.call(this as unknown as TranslationHost, object, options);
  }
}

describe("TranslationControllerTest", () => {
  let controller: TranslationController;

  beforeEach(() => {
    controller = new TranslationController();
    I18n.backend.storeTranslations("en", {
      one: { two: "bar" },
      abstract_controller: {
        testing: {
          translation: {
            index: {
              foo: "bar",
              hello: "<a>Hello World</a>",
              hello_html: "<a>Hello World</a>",
              interpolated_html: "<a>Hello %{word}</a>",
              nested: { html: "<a>nested</a>" },
            },
            no_action: "no_action_tr",
          },
        },
      },
    });
  });

  it("action controller base responds to translate", () => {
    expect(typeof controller.translate).toBe("function");
  });

  it("action controller base responds to t", () => {
    expect(typeof controller.t).toBe("function");
  });

  it("action controller base responds to localize", () => {
    expect(typeof controller.localize).toBe("function");
  });

  it("action controller base responds to l", () => {
    expect(typeof controller.l).toBe("function");
  });

  // BLOCKED: `I18n.translate` does not support `{ raise: true }`. It
  // returns a "Translation missing: ..." string for unknown keys. Adding
  // a raise option to activesupport I18n is a ~30 LOC follow-up
  // (introduce `MissingTranslationData` class, threading the option).
  it.skip("raises missing translation message with raise option", () => {});

  it("lazy lookup", () => {
    controller.actionName = "index";
    expect(controller.t(".foo")).toBe("bar");
  });

  it("nil key lookup", () => {
    const fallback = "foo";
    expect(controller.t(null as unknown as string, { default: fallback })).toBe(fallback);
  });

  it("lazy lookup with symbol", () => {
    // Rails distinguishes :".foo" (symbol) from ".foo" (string). JS has
    // no symbol literals usable as i18n keys; the string form is the
    // direct equivalent.
    controller.actionName = "index";
    expect(controller.t(".foo")).toBe("bar");
  });

  it("lazy lookup fallback", () => {
    controller.actionName = "index";
    expect(controller.t(".no_action")).toBe("no_action_tr");
  });

  it("default translation", () => {
    controller.actionName = "index";
    expect(controller.t("one.two")).toBe("bar");
    expect(controller.t(".twoz", { default: ["baz", ":twoz"] })).toBe("baz");
  });

  // BLOCKED: trails has no `html_safe?` marker on strings. The whole
  // _html-suffix → html_safe + interpolation-escape feature is an
  // actionview-tier concern (~200 LOC: html_safe brand on strings,
  // sanitize-on-interpolate in I18n, _html-suffix detection in
  // translate). All 7 of the following depend on it.
  it.skip("default translation as unsafe html", () => {});
  it.skip("default translation as safe html", () => {});
  it.skip("default translation with raise as unsafe html", () => {});
  it.skip("default translation with raise as safe html", () => {});

  it("localize", () => {
    const time = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
    expect(typeof controller.l(time)).toBe("string");
    expect(controller.l(time)).toBe(localize.call(controller as unknown as TranslationHost, time));
  });

  it.skip("translate does not mark plain text as safe html", () => {});
  it.skip("translate marks translations with a html suffix as safe html", () => {});
  it.skip("translate marks translation with nested html key", () => {});
  it.skip("translate escapes interpolations in translations with a html suffix", () => {});
  it.skip("translate marks translation with missing html key as safe html", () => {});
  it.skip("translate marks translation with missing nested html key as safe html", () => {});
});

// ==========================================================================
// trails-only coverage — exercises the standalone-function shape that
// Rails doesn't have. Kept for regression-prevention on the `this`-typed
// call site (`translate.call(host, ...)`); no Rails counterpart.
// ==========================================================================
function makeHost(controllerPath: string, actionName: string): TranslationHost {
  return {
    actionName,
    constructor: { controllerPath: () => controllerPath },
  } as unknown as TranslationHost;
}

describe("AbstractController::Translation — trails-only", () => {
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

  it("forwards caller options (e.g. locale) to internal lookups on dot keys", () => {
    I18n.backend.storeTranslations("fr", {
      people: { index: { foo: "bonjour" } },
    });
    const host = makeHost("people", "index");
    expect(translate.call(host, ".foo", { locale: "fr" })).toBe("bonjour");
  });

  it("converts slashes in controller path to dots", () => {
    I18n.backend.storeTranslations("en", {
      admin: { users: { show: { foo: "admin users show foo" } } },
    });
    const host = makeHost("admin/users", "show");
    expect(translate.call(host, ".foo")).toBe("admin users show foo");
  });
});
