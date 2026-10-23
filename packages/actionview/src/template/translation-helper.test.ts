import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18n, assertCalledWith, isHtmlSafe } from "@blazetrails/activesupport";
import { Hash } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { TemplateHandlers } from "./handlers.js";
import { TSE } from "./handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { localize, translate as translateHelper } from "../helpers/translation-helper.js";

const CustomExceptionHandler = { call: () => "from CustomExceptionHandler" };

const TEMPLATES: Record<string, string> = {
  "translations/templates/array.html.tse": "<%= t('.foo.bar') %>",
  "translations/templates/default.html.tse": "<%= t('.missing', { default: ':.foo' }) %>",
  "translations/templates/found.html.tse": "<%= t('.foo') %>",
  "translations/templates/found_yield_block.html.tse": `<%= t('.foo', {}, (translation, key) => { %> <%= key %>: <%= translation %> <% }) %>`,
  "translations/templates/found_yield_single_argument.html.tse": `<%= t('.foo', {}, (translation) => { %> <%= translation %> <% }) %>`,
  "translations/templates/missing.html.tse": "<%= t('.missing') %>",
  "translations/templates/missing_with_default_yield_block.html.tse": `<%= translate(".missing", { default: "Default" }, (translation, key) => { %> <%= key %>: <%= translation %> <% }) %>`,
  "translations/templates/missing_with_default_yield_single_argument_block.html.tse": `<%= translate(".missing", { default: "Default" }, (translation) => { %> <%= translation %> <% }) %>`,
  "translations/templates/missing_yield_block.html.tse": `<%= t('.missing', {}, (translation, key) => { %> <%= key %>: <%= translation %> <% }) %>`,
  "translations/templates/missing_yield_single_argument_block.html.tse": `<%= t('.missing', {}, (translation) => { %> <%= translation %> <% }) %>`,
  "translations/templates/_partial.html.tse": "<%= t('.foo') %>\n<%= yield %>",
  "translations/templates/partial_lazy_translation_block.html.tse":
    '<%= render("translations/templates/partial", () => { %>\n<% }) %>',
  "translations/templates/partial_lazy_translation.html.tse":
    '<%= render("translations/templates/partial") %>',
};

describe("TranslationHelperTest", () => {
  let view: InstanceType<typeof Base>;
  const translate = (key: unknown, options?: Record<string, unknown>) =>
    translateHelper.call(view, key, options);
  const render = async (template: string) => String(await view.render({ template })).trim();

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new TSE());
    I18n.backend().storeTranslations("en", {
      translations: {
        templates: {
          found: { foo: "Foo" },
          found_yield_single_argument: { foo: "Foo" },
          found_yield_block: { foo: "Foo" },
          array: { foo: { bar: "Foo Bar" } },
          default: { foo: "Foo" },
          partial: { foo: "Partial foo" },
        },
        foo: "Foo",
        hello: "<a>Hello World</a>",
        html: "<a>Hello World</a>",
        hello_html: "<a>Hello World</a>",
        interpolated_html: "<a>Hello %{word}</a>",
        array_html: ["foo", "bar"],
        array: ["foo", "bar"],
        count_html: {
          one: "<a>One %{count}</a>",
          other: "<a>Other %{count}</a>",
        },
      },
    });
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([new FixtureResolver(TEMPLATES)]);
    view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
  });

  afterEach(async () => {
    TemplateHandlers.clear();
    await I18n.backend().reloadBang();
  });

  it("delegates setting to i18n", () => {
    let matcherCalled = false;
    const spy = vi.spyOn(I18n.backend(), "translate").mockImplementation((locale, key) => {
      matcherCalled = true;
      expect(key).toBe(":foo");
      expect(locale).toBe("en");
      return null;
    });
    try {
      translate(":foo", { locale: "en" });
    } finally {
      spy.mockRestore();
    }
    expect(matcherCalled).toBeTruthy();
  });

  it("delegates localize to i18n", () => {
    const time = Time.utc(2008, 7, 8, 12, 18, 38);
    assertCalledWith(I18n, "localize", [time, { locale: "en" }], {}, () => {
      localize(time, { locale: "en" });
    });
    expect(localize(time, { locale: "en" })).toBe("Tue, 08 Jul 2008 12:18:38 +0000");
  });

  it("converts key to string as necessary", () => {
    const key = { toString: () => "translations.foo" };
    expect(translate(key)).toBe("Foo");
    expect(translate(":translations.missing", { default: key })).toBe(key);
  });

  it("returns nil for nil key without default", () => {
    expect(translate(null)).toBeNull();
  });

  it("returns default for nil key with default", () => {
    expect(translate(null, { default: "Foo" })).toBe("Foo");
    expect(String(translate(null, { default: ":translations.foo" }))).toBe("Foo");
    expect(isHtmlSafe(translate(null, { default: ":translations.html" }))).toBeTruthy();
  });

  it("returns missing translation message without span wrap", () => {
    const oldValue = Base.debugMissingTranslation;
    Base.debugMissingTranslation = false;
    try {
      expect(translate(":translations.missing")).toBe(
        "translation missing: en.translations.missing",
      );
    } finally {
      Base.debugMissingTranslation = oldValue;
    }
  });

  it("returns missing translation message wrapped into span", () => {
    const expected =
      '<span class="translation_missing" title="translation missing: en.translations.missing">Missing</span>';
    expect(String(translate(":translations.missing"))).toBe(expected);
    expect(isHtmlSafe(translate(":translations.missing"))).toBe(true);
  });

  it("returns missing translation message with unescaped interpolation", () => {
    const expected =
      '<span class="translation_missing" title="translation missing: en.translations.missing, name: Kir, year: 2015, vulnerable: &amp;quot; onclick=&amp;quot;alert()&amp;quot;">Missing</span>';
    expect(
      String(
        translate(":translations.missing", {
          name: "Kir",
          year: "2015",
          vulnerable: '" onclick="alert()"',
        }),
      ),
    ).toBe(expected);
    expect(isHtmlSafe(translate(":translations.missing"))).toBeTruthy();
  });

  it("returns missing translation message does filters out i18n options", () => {
    let expected =
      '<span class="translation_missing" title="translation missing: en.translations.missing, year: 2015">Missing</span>';
    expect(String(translate(":translations.missing", { year: "2015", default: [] }))).toBe(
      expected,
    );

    expected =
      '<span class="translation_missing" title="translation missing: en.scoped.translations.missing, year: 2015">Missing</span>';
    expect(String(translate(":translations.missing", { year: "2015", scope: [":scoped"] }))).toBe(
      expected,
    );
  });

  it("raises missing translation message with raise option", () => {
    expect(() => translate(":translations.missing", { raise: true })).toThrow(
      I18n.MissingTranslationData,
    );
  });

  it("uses custom exception handler when specified", () => {
    const oldExceptionHandler = I18n.exceptionHandler();
    I18n.setExceptionHandler(CustomExceptionHandler as never);
    try {
      expect(translate(":translations.missing", { raise: false })).toBe(
        "from CustomExceptionHandler",
      );
    } finally {
      I18n.setExceptionHandler(oldExceptionHandler);
    }
  });

  it("uses custom exception handler when specified for html", () => {
    const oldExceptionHandler = I18n.exceptionHandler();
    I18n.setExceptionHandler(CustomExceptionHandler as never);
    try {
      expect(translate(":translations.missing_html", { raise: false })).toBe(
        "from CustomExceptionHandler",
      );
    } finally {
      I18n.setExceptionHandler(oldExceptionHandler);
    }
  });

  it("translation returning an array", () => {
    expect(translate(":translations.array")).toEqual(["foo", "bar"]);
  });

  it("finds translation scoped by partial", async () => {
    expect(await render("translations/templates/found")).toBe("Foo");
  });

  it("finds translation scoped by partial yielding single argument block", async () => {
    expect(await render("translations/templates/found_yield_single_argument")).toBe("Foo");
  });

  it("finds lazy translation scoped by partial", async () => {
    expect(await render("translations/templates/partial_lazy_translation")).toBe("Partial foo");
  });

  it("finds lazy translation scoped by partial with block", async () => {
    expect(await render("translations/templates/partial_lazy_translation_block")).toBe(
      "Partial foo",
    );
  });

  it("finds translation scoped by partial yielding translation and key", async () => {
    expect(await render("translations/templates/found_yield_block")).toBe(
      "translations.templates.found_yield_block.foo: Foo",
    );
  });

  it("finds array of translations scoped by partial", async () => {
    expect(await render("translations/templates/array")).toBe("Foo Bar");
  });

  it("default lookup scoped by partial", async () => {
    expect(await render("translations/templates/default")).toBe("Foo");
  });

  it("missing translation scoped by partial", async () => {
    const expected =
      '<span class="translation_missing" title="translation missing: en.translations.templates.missing.missing">Missing</span>';
    expect(await render("translations/templates/missing")).toBe(expected);
  });

  it("missing translation scoped by partial yield block", async () => {
    const expected =
      'translations.templates.missing_yield_block.missing: <span class="translation_missing" title="translation missing: en.translations.templates.missing_yield_block.missing">Missing</span>';
    expect(await render("translations/templates/missing_yield_block")).toBe(expected);
  });

  it("missing translation scoped by partial yield block without debug wrapper", async () => {
    const oldDebugMissingTranslation = Base.debugMissingTranslation;
    Base.debugMissingTranslation = false;
    try {
      const expected =
        "translations.templates.missing_yield_block.missing: translation missing: en.translations.templates.missing_yield_block.missing";
      expect(await render("translations/templates/missing_yield_block")).toBe(expected);
    } finally {
      Base.debugMissingTranslation = oldDebugMissingTranslation;
    }
  });

  it("missing translation with default scoped by partial yield block", async () => {
    expect(await render("translations/templates/missing_with_default_yield_block")).toBe(
      "translations.templates.missing_with_default_yield_block.missing: Default",
    );
  });

  it("missing translation scoped by partial yield single argument block", async () => {
    const expected =
      '<span class="translation_missing" title="translation missing: en.translations.templates.missing_yield_single_argument_block.missing">Missing</span>';
    expect(await render("translations/templates/missing_yield_single_argument_block")).toBe(
      expected,
    );
  });

  it("missing translation with default scoped by partial yield single argument block", async () => {
    expect(
      await render("translations/templates/missing_with_default_yield_single_argument_block"),
    ).toBe("Default");
  });

  it("translate does not mark plain text as safe html", () => {
    expect(isHtmlSafe(translate(":translations.hello"))).toBe(false);
  });

  it("translate marks translations named html as safe html", () => {
    expect(isHtmlSafe(translate(":translations.html"))).toBeTruthy();
  });

  it("translate marks translations with a html suffix as safe html", () => {
    expect(isHtmlSafe(translate(":translations.hello_html"))).toBeTruthy();
  });

  it("translate escapes interpolations in translations with a html suffix", () => {
    const wordStruct = { toString: () => "<World>" };
    expect(String(translate(":translations.interpolated_html", { word: "<World>" }))).toBe(
      "<a>Hello &lt;World&gt;</a>",
    );
    expect(String(translate(":translations.interpolated_html", { word: wordStruct }))).toBe(
      "<a>Hello &lt;World&gt;</a>",
    );
  });

  it("translate with html count", () => {
    expect(String(translate(":translations.count_html", { count: 1 }))).toBe("<a>One 1</a>");
    expect(String(translate(":translations.count_html", { count: 2 }))).toBe("<a>Other 2</a>");
    expect(String(translate(":translations.count_html", { count: "<One>" }))).toBe(
      "<a>Other &lt;One&gt;</a>",
    );
  });

  it("translate marks array of translations with a html safe suffix as safe html", () => {
    const translated = translate(":translations.array_html") as unknown[];
    expect(translated.map(String)).toEqual(["foo", "bar"]);
    expect(translated.every((t) => isHtmlSafe(t))).toBeTruthy();
  });

  it("translate with default and raise false", () => {
    const translation = translate(":translations.missing", {
      default: ":translations.foo",
      raise: false,
    });
    expect(String(translation)).toBe("Foo");
  });

  it("translate with default named html", () => {
    const translation = translate(":translations.missing", {
      default: ":translations.hello_html",
    });
    expect(String(translation)).toBe("<a>Hello World</a>");
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("translate with default named html and raise false", () => {
    const translation = translate(":translations.missing", {
      default: ":translations.hello_html",
      raise: false,
    });
    expect(String(translation)).toBe("<a>Hello World</a>");
    expect(isHtmlSafe(translation)).toBeTruthy();
  });

  it("translate with missing default", () => {
    const translation = translate(":translations.missing", { default: ":also_missing" });
    const expected =
      '<span class="translation_missing" title="translation missing: en.translations.missing">Missing</span>';
    expect(String(translation)).toBe(expected);
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("translate with missing default and raise option", () => {
    expect(() =>
      translate(":translations.missing", { default: ":translations.missing_html", raise: true }),
    ).toThrow(I18n.MissingTranslationData);
  });

  it("translate with html key and missing default and raise option", () => {
    expect(() =>
      translate(":translations.missing_html", {
        default: ":translations.missing_html",
        raise: true,
      }),
    ).toThrow(I18n.MissingTranslationData);
  });

  it("translate with two defaults named html", () => {
    const translation = translate(":translations.missing", {
      default: [":translations.missing_html", ":translations.hello_html"],
    });
    expect(String(translation)).toBe("<a>Hello World</a>");
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("translate with last default named html", () => {
    const translation = translate(":translations.missing", {
      default: [":translations.missing", ":translations.hello_html"],
    });
    expect(String(translation)).toBe("<a>Hello World</a>");
    expect(isHtmlSafe(translation)).toBe(true);
  });

  it("translate with last default not named html", () => {
    const translation = translate(":translations.missing", {
      default: [":translations.missing_html", ":translations.foo"],
    });
    expect(String(translation)).toBe("Foo");
    expect(isHtmlSafe(translation)).toBe(false);
  });

  it("translate does not mark unsourced string default as html safe", () => {
    const untrustedString = "<script>alert()</script>";
    const translation = translate(":translations.missing", {
      default: [":translations.missing_html", untrustedString],
    });
    expect(translation).toBe(untrustedString);
    expect(isHtmlSafe(translation)).toBeFalsy();
  });

  it("translate with string default", () => {
    expect(translate(":translations.missing", { default: "A Generic String" })).toBe(
      "A Generic String",
    );
  });

  it("translate with interpolated string default", () => {
    expect(
      translate(":translations.missing", { default: "An %{kind} String", kind: "Interpolated" }),
    ).toBe("An Interpolated String");
  });

  it("translate with hash default", () => {
    const hash = new Hash<string, string>()
      .set(":one", "%{count} thing")
      .set(":other", "%{count} things");
    expect(translate(":translations.missing", { default: hash })).toEqual(hash);
  });

  it("translate with hash default and count", () => {
    const hash = new Hash<string, string>()
      .set(":one", "%{count} thing")
      .set(":other", "%{count} things");
    expect(translate(":translations.missing", { default: hash, count: 1 })).toBe("1 thing");
    expect(translate(":translations.missing", { default: hash, count: 2 })).toBe("2 things");
  });

  it("translate with proc default", () => {
    expect(translate(":translations.missing", { default: () => "From Proc" })).toBe("From Proc");
  });

  it("translate with object default", () => {
    expect(translate(":translations.missing", { default: 123 })).toBe(123);
  });

  it("translate with array of string defaults", () => {
    expect(
      translate(":translations.missing", {
        default: ["A Generic String", "Second generic string"],
      }),
    ).toBe("A Generic String");
  });

  it("translate with array of defaults with nil", () => {
    expect(
      translate(":translations.missing", { default: [":also_missing", null, "A Generic String"] }),
    ).toBe("A Generic String");
  });

  it("translate with array of array default", () => {
    expect(translate(":translations.missing", { default: [[]] })).toEqual([]);
  });

  it("translate with false default", () => {
    expect(translate(":translations.missing", { default: false })).toBe(false);
  });

  it("translate with nil default", () => {
    expect(translate(":translations.missing", { default: null })).toBeNull();
  });

  it("translate bulk lookup", () => {
    expect(translate([":translations.foo", ":translations.foo"])).toEqual(["Foo", "Foo"]);
  });

  it("translate bulk lookup with default", () => {
    expect(
      (
        translate([":translations.missing", ":translations.missing"], {
          default: ":translations.foo",
        }) as unknown[]
      ).map(String),
    ).toEqual(["Foo", "Foo"]);
  });

  it("translate bulk lookup html", () => {
    const translations = translate([":translations.html", ":translations.hello_html"]) as unknown[];
    expect(translations.map(String)).toEqual(["<a>Hello World</a>", "<a>Hello World</a>"]);
    for (const translation of translations) expect(isHtmlSafe(translation)).toBeTruthy();
  });

  it("translate bulk lookup html with default", () => {
    const translations = translate([":translations.missing", ":translations.missing"], {
      default: ":translations.html",
    }) as unknown[];
    expect(translations.map(String)).toEqual(["<a>Hello World</a>", "<a>Hello World</a>"]);
    for (const translation of translations) expect(isHtmlSafe(translation)).toBeTruthy();
  });

  it("translate does not change options", () => {
    const options = {};
    translate(":translations.missing", options);
    expect(options).toEqual({});
  });

  // PERMANENT-SKIP: the assertions turn on a lookup reaching `I18n.cache_store` (`vendor/i18n/v1.14.8/lib/i18n/backend/cache.rb:93-99`); CLAUDE.md § "A translation lookup is synchronous; the load is an awaited step" leaves `I18n::Backend::Cache` unported, so the Rails body it names does not type-check either.
  it.skip("translate caching backend", () => {});
});
