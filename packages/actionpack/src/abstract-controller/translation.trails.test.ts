import { beforeEach, describe, expect, it } from "vitest";
import { MissingTranslationData } from "@blazetrails/i18n";
import { I18n, isHtmlSafe } from "@blazetrails/activesupport";
import { translate, type TranslationHost } from "./translation.js";

class TranslationController {
  static controllerPath(): string {
    return "abstract_controller/testing/translation";
  }
  actionName = "";
  translate = translate;
  t = translate;
}

I18n.setEnforceAvailableLocales(false);

describe("TranslationControllerTest — trails-only", () => {
  let controller: TranslationController;

  beforeEach(() => {
    controller = new TranslationController();
    I18n.backend().storeTranslations("en", { one: { two: "bar" } });
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

  it("looks a colon-led default up as a key on an html key instead of rendering it", () => {
    I18n.backend().storeTranslations("en", { people: { "<b>": "<b>stored</b>" } });
    const host = makeHost("people", "index");

    const found = translate.call(host, ".missing_html", { default: [":people.<b>"] });
    expect(String(found)).toBe("<b>stored</b>");
    expect(isHtmlSafe(found)).toBe(true);

    const missed = translate.call(host, ".missing_html", { default: [":<script>"] });
    expect(String(missed)).not.toBe(":<script>");
    expect(isHtmlSafe(missed)).toBe(false);
  });

  it("scopes a lazy lookup by the kebab-case form of a camelCase action", () => {
    I18n.backend().storeTranslations("en", {
      abstract_controller: { testing: { translation: { "recent-posts": { title: "Recent" } } } },
    });
    const controller = new TranslationController();
    controller.actionName = "recentPosts";

    expect(controller.translate(".title")).toBe("Recent");
  });
});
