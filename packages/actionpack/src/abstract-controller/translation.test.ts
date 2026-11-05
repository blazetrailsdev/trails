import { beforeEach, describe, expect, it } from "vitest";
import { MissingTranslationData } from "@blazetrails/i18n";
import { I18n, include, isHtmlSafe, stub, type Included } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
import { AbstractController } from "../namespaces.js";
import { Base } from "./base.js";
import { Translation } from "./translation.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface TranslationController extends Included<typeof Translation> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class TranslationController extends Base {}
include(TranslationController, Translation);

const Testing = {};
constSet(AbstractController, "Testing", Testing);
constSet(Testing, "TranslationController", TranslationController);

I18n.setEnforceAvailableLocales(false);

describe("TranslationControllerTest", () => {
  let controller: TranslationController;

  beforeEach(() => {
    controller = new TranslationController();
    I18n.backend().storeTranslations("en", {
      one: {
        two: "bar",
      },
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
    expect(() => controller.t(":translations.missing", { raise: true })).toThrow(
      MissingTranslationData,
    );
  });

  it("lazy lookup", () => {
    stub(controller, "actionName", "index", [], () => {
      expect(controller.t(".foo")).toEqual("bar");
    });
  });

  it("nil key lookup", () => {
    const default_ = "foo";
    expect(controller.t(null, { default: default_ })).toEqual(default_);
  });

  // BLOCKED: translate-reads-a-symbol-key-for-lazy-lookup
  it.skip("lazy lookup with symbol", () => {
    stub(controller, "actionName", "index", [], () => {
      expect(controller.t(":.foo")).toEqual("bar");
    });
  });

  // BLOCKED: translate-reads-a-symbol-key-for-lazy-lookup
  it.skip("lazy lookup fallback", () => {
    stub(controller, "actionName", "index", [], () => {
      expect(controller.t(":.no_action")).toEqual("no_action_tr");
    });
  });

  it("default translation", () => {
    stub(controller, "actionName", "index", [], () => {
      expect(controller.t("one.two")).toEqual("bar");
      expect(controller.t(".twoz", { default: ["baz", ":twoz"] })).toEqual("baz");
    });
  });

  it("default translation as unsafe html", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t(".twoz", { default: ["<tag>"] });
      expect(String(translation)).toEqual("<tag>");
      expect(isHtmlSafe(translation)).toEqual(false);
    });
  });

  it("default translation as safe html", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t(".twoz_html", { default: ["<tag>"] });
      expect(String(translation)).toEqual("&lt;tag&gt;");
      expect(isHtmlSafe(translation)).toEqual(true);
    });
  });

  it("default translation with raise as unsafe html", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t(".twoz", { raise: true, default: ["<tag>"] });
      expect(String(translation)).toEqual("<tag>");
      expect(isHtmlSafe(translation)).toEqual(false);
    });
  });

  it("default translation with raise as safe html", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t(".twoz_html", { raise: true, default: ["<tag>"] });
      expect(String(translation)).toEqual("&lt;tag&gt;");
      expect(isHtmlSafe(translation)).toEqual(true);
    });
  });

  it("localize", () => {
    const time = new Date(Date.UTC(2000, 0, 1));
    const expected = "Sat, 01 Jan 2000 00:00:00 +0000";
    stub(I18n, "localize", expected, [], () => {
      expect(controller.l(time)).toEqual(expected);
    });
  });

  it("translate does not mark plain text as safe html", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t(".hello");
      expect(String(translation)).toEqual("<a>Hello World</a>");
      expect(isHtmlSafe(translation)).toEqual(false);
    });
  });

  it("translate marks translations with a html suffix as safe html", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t(".hello_html");
      expect(String(translation)).toEqual("<a>Hello World</a>");
      expect(isHtmlSafe(translation)).toEqual(true);
    });
  });

  it("translate marks translation with nested html key", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t(".nested.html");
      expect(String(translation)).toEqual("<a>nested</a>");
      expect(isHtmlSafe(translation)).toEqual(true);
    });
  });

  it("translate escapes interpolations in translations with a html suffix", () => {
    const wordStruct = class {
      constructor(public toS: string) {}
      toString(): string {
        return this.toS;
      }
    };
    stub(controller, "actionName", "index", [], () => {
      let translation = controller.t(".interpolated_html", { word: "<World>" });
      expect(String(translation)).toEqual("<a>Hello &lt;World&gt;</a>");
      expect(isHtmlSafe(translation)).toEqual(true);

      translation = controller.t(".interpolated_html", { word: new wordStruct("<World>") });
      expect(String(translation)).toEqual("<a>Hello &lt;World&gt;</a>");
      expect(isHtmlSafe(translation)).toEqual(true);
    });
  });

  it("translate marks translation with missing html key as safe html", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t("<tag>.html");
      expect(isHtmlSafe(translation)).toEqual(false);
      expect(String(translation)).toEqual("Translation missing: en.<tag>.html");
    });
  });

  it("translate marks translation with missing nested html key as safe html", () => {
    stub(controller, "actionName", "index", [], () => {
      const translation = controller.t(".<tag>.html");
      expect(isHtmlSafe(translation)).toEqual(false);
      expect(String(translation)).toEqual(
        [
          "Translation missing. Options considered were:",
          "- en.abstract_controller.testing.translation.index.<tag>.html",
          "- en.abstract_controller.testing.translation.<tag>.html",
        ].join("\n"),
      );
    });
  });
});
