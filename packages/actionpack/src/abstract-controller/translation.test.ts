import { beforeEach, describe, expect, it } from "vitest";
import { MissingTranslationData } from "@blazetrails/i18n";
import { I18n, isHtmlSafe } from "@blazetrails/activesupport";
import {
  l,
  localize,
  t,
  translate,
  type LocalizeOptions,
  type TranslateOptions,
  type TranslationHost,
} from "./translation.js";

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

I18n.setEnforceAvailableLocales(false);

describe("TranslationControllerTest", () => {
  let controller: TranslationController;

  beforeEach(() => {
    controller = new TranslationController();
    I18n.backend().storeTranslations("en", {
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

  it("raises missing translation message with raise option", () => {
    expect(() => controller.t("translations.missing", { raise: true })).toThrow(
      MissingTranslationData,
    );
  });

  it("dot-prefixed lookup with raise: true still honors the user default chain", () => {
    controller.actionName = "index";
    expect(controller.t(".twoz", { raise: true, default: [":one.two"] })).toBe("bar");
  });

  it("raises when raise: true and the whole chain (scoped + fallback + defaults-as-keys) misses", () => {
    controller.actionName = "index";
    expect(() =>
      controller.t(".twoz", { raise: true, default: [":also.missing", ":still.gone"] }),
    ).toThrow(MissingTranslationData);
  });

  it("lazy lookup", () => {
    controller.actionName = "index";
    expect(controller.t(".foo")).toBe("bar");
  });

  it("nil key lookup", () => {
    const fallback = "foo";
    expect(controller.t(null as unknown as string, { default: fallback })).toBe(fallback);
  });

  it("lazy lookup with symbol", () => {
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

  it("default translation as unsafe html", () => {
    controller.actionName = "index";
    const translation = controller.t(".twoz", { default: ["<tag>"] });
    expect(String(translation)).toBe("<tag>");
    expect(isHtmlSafe(translation)).toBe(false);
  });

  it("default translation as safe html", () => {
    controller.actionName = "index";
    const translation = controller.t(".twoz_html", { default: ["<tag>"] });
    expect(String(translation)).toBe("&lt;tag&gt;");
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("default translation with raise as unsafe html", () => {
    controller.actionName = "index";
    const translation = controller.t(".twoz", { raise: true, default: ["<tag>"] });
    expect(String(translation)).toBe("<tag>");
    expect(isHtmlSafe(translation)).toBe(false);
  });

  it("default translation with raise as safe html", () => {
    controller.actionName = "index";
    const translation = controller.t(".twoz_html", { raise: true, default: ["<tag>"] });
    expect(String(translation)).toBe("&lt;tag&gt;");
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("localize", () => {
    const time = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
    const expected = "Sat, 01 Jan 2000 00:00:00 +0000";
    const backend = I18n.backend() as { localize?: unknown };
    const original = Object.getOwnPropertyDescriptor(backend, "localize");
    backend.localize = () => expected;
    try {
      expect(controller.l(time)).toBe(expected);
    } finally {
      if (original) Object.defineProperty(backend, "localize", original);
      else delete backend.localize;
    }
  });

  it("translate does not mark plain text as safe html", () => {
    controller.actionName = "index";
    const translation = controller.t(".hello");
    expect(String(translation)).toBe("<a>Hello World</a>");
    expect(isHtmlSafe(translation)).toBe(false);
  });

  it("translate marks translations with a html suffix as safe html", () => {
    controller.actionName = "index";
    const translation = controller.t(".hello_html");
    expect(String(translation)).toBe("<a>Hello World</a>");
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("translate marks translation with nested html key", () => {
    controller.actionName = "index";
    const translation = controller.t(".nested.html");
    expect(String(translation)).toBe("<a>nested</a>");
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("translate escapes interpolations in translations with a html suffix", () => {
    controller.actionName = "index";
    const translation = controller.t(".interpolated_html", { word: "<World>" });
    expect(String(translation)).toBe("<a>Hello &lt;World&gt;</a>");
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("translate marks translation with missing html key as safe html", () => {
    controller.actionName = "index";
    const translation = controller.t("<tag>.html");
    expect(isHtmlSafe(translation)).toBe(false);
    expect(String(translation)).toBe("Translation missing: en.<tag>.html");
  });

  it("translate marks translation with missing nested html key as safe html", () => {
    controller.actionName = "index";
    const translation = controller.t(".<tag>.html");
    expect(isHtmlSafe(translation)).toBe(false);
  });
});

function makeHost(controllerPath: string, actionName: string): TranslationHost {
  return {
    actionName,
    constructor: { controllerPath: () => controllerPath },
  } as unknown as TranslationHost;
}

describe("AbstractController::Translation — trails-only", () => {
  beforeEach(() => {
    I18n.backend().storeTranslations("en", {
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
    I18n.backend().storeTranslations("fr", {
      people: { index: { foo: "bonjour" } },
    });
    const host = makeHost("people", "index");
    expect(translate.call(host, ".foo", { locale: "fr" })).toBe("bonjour");
  });

  it("converts slashes in controller path to dots", () => {
    I18n.backend().storeTranslations("en", {
      admin: { users: { show: { foo: "admin users show foo" } } },
    });
    const host = makeHost("admin/users", "show");
    expect(translate.call(host, ".foo")).toBe("admin users show foo");
  });
});
