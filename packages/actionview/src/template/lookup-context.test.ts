import { afterEach, beforeEach, describe, it } from "vitest";
import { MimeType } from "@blazetrails/actionpack";
import {
  I18n,
  assert,
  assertEqual,
  assertKindOf,
  assertCalled,
  assertMatch,
  assertNil,
  assertNot,
  assertNotEqual,
  assertPredicate,
  assertRaises,
  assertSame,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { DetailsKey, LookupContext } from "../lookup-context.js";
import { PathSet } from "../path-set.js";
import type { Template } from "../template.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { ActionView } from "../namespaces.js";
import { MissingTemplate } from "./error.js";
import { TemplateHandlers } from "./handlers.js";
import { TSE } from "./handlers/tse.js";

const FIXTURE_LOAD_PATH = new FixtureResolver({
  "test/hello_world.tse": "Hello world!",
  "test/hello_world.da.html.tse": "Hey verden",
  "test/hello_world.html+phone.tse": "Hello phone!",
  "test/hello_world.text+phone.tse": "Hello texty phone!",
});

describe("LookupContextTest", () => {
  let lookupContext: LookupContext;
  let enforceAvailableLocales: boolean;

  function buildLookupContext(
    paths: ConstructorParameters<typeof LookupContext>[0],
    details: ConstructorParameters<typeof LookupContext>[1],
  ): LookupContext {
    return new LookupContext(paths, details);
  }

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new TSE());
    enforceAvailableLocales = I18n.enforceAvailableLocales();
    I18n.setEnforceAvailableLocales(false);
    lookupContext = buildLookupContext([FIXTURE_LOAD_PATH], {});
    DetailsKey.clear();
  });

  afterEach(() => {
    I18n.setLocale("en");
    I18n.setEnforceAvailableLocales(enforceAvailableLocales);
    TemplateHandlers.clear();
  });

  it("allows to override default_formats with ActionView::Base.default_formats", () => {
    const formats = Base.defaultFormats;
    try {
      Base.defaultFormats = [":foo", ":bar"];

      assertEqual(
        [":foo", ":bar"],
        (new LookupContext([]) as unknown as { defaultFormats(): unknown }).defaultFormats(),
      );
    } finally {
      Base.defaultFormats = formats;
    }
  });

  it("process view paths on initialization", () => {
    assertKindOf(PathSet, lookupContext.viewPaths);
  });

  it("normalizes details on initialization", () => {
    assertEqual(MimeType.SET.symbols, lookupContext.formats);
    assertEqual(":en", lookupContext.locale);
  });

  it("allows me to freeze and retrieve frozen formats", () => {
    Object.freeze(lookupContext.formats);
    assertPredicate(lookupContext.formats, Object.isFrozen);
  });

  it("provides getters and setters for variants", () => {
    lookupContext.variants = [":mobile"];
    assertEqual([":mobile"], lookupContext.variants);
  });

  it("provides getters and setters for formats", () => {
    lookupContext.formats = [":html"];
    assertEqual([":html"], lookupContext.formats);
  });

  it("handles */* formats", () => {
    lookupContext.formats = ["*/*"];
    assertEqual(MimeType.SET.symbols, lookupContext.formats);
  });

  it("handles explicitly defined */* formats fallback to :js", () => {
    lookupContext.formats = [":js", "*/*"];
    assertEqual([...new Set([":js", ...MimeType.SET.symbols])], lookupContext.formats);
  });

  it("adds :html fallback to :js formats", () => {
    lookupContext.formats = [":js"];
    assertEqual([":js", ":html"], lookupContext.formats);
  });

  it("raises on invalid format assignment", async () => {
    const ex = await assertRaises([ArgumentError], {}, () => {
      lookupContext.formats = [":html", ":invalid", "also bad"];
    });

    assertEqual('Invalid formats: :invalid, "also bad"', ex.message);
  });

  it("provides getters and setters for locale", () => {
    lookupContext.locale = ":pt";
    assertEqual(":pt", lookupContext.locale);
  });

  it("changing lookup_context locale, changes I18n.locale", () => {
    lookupContext.locale = ":pt";
    assertEqual("pt", I18n.locale());
  });

  it("delegates changing the locale to the I18n configuration object if it contains a lookup_context object", () => {
    const { I18nProxy } = ActionView as unknown as {
      I18nProxy: new (
        config: ReturnType<typeof I18n.config>,
        lookupContext: LookupContext,
      ) => ReturnType<typeof I18n.config>;
    };
    try {
      I18n.setConfig(new I18nProxy(I18n.config(), lookupContext));
      lookupContext.locale = ":pt";
      assertEqual("pt", I18n.locale());
      assertEqual(":pt", lookupContext.locale);
    } finally {
      I18n.setConfig(
        (I18n.config() as unknown as { originalConfig: ReturnType<typeof I18n.config> })
          .originalConfig,
      );
    }

    assertEqual("pt", I18n.locale());
  });

  it("find templates using the given view paths and configured details", () => {
    let template = lookupContext.find("hello_world", ["test"]) as Template;
    assertEqual("Hello world!", template.source);

    lookupContext.locale = ":da";
    template = lookupContext.find("hello_world", ["test"]) as Template;
    assertEqual("Hey verden", template.source);
  });

  it("find templates with given variants", () => {
    lookupContext.formats = [":html"];
    lookupContext.variants = [":phone"];

    let template = lookupContext.find("hello_world", ["test"]) as Template;
    assertEqual("Hello phone!", template.source);

    lookupContext.variants = [":phone"];
    lookupContext.formats = [":text"];

    template = lookupContext.find("hello_world", ["test"]) as Template;
    assertEqual("Hello texty phone!", template.source);
  });

  // BLOCKED: port-builder-template-handler
  it.skip("found templates have nil format if one cannot be found from template or handler", async () => {
    const { Builder } = TemplateHandlers as unknown as { Builder: { defaultFormat: unknown } };
    await assertCalled(Builder, "defaultFormat", null, { returns: null }, () => {
      lookupContext.formats = [":text"];
      const template = lookupContext.find("hello", ["test"]) as Template;
      assertNil(template.format);
    });
  });

  it("generates a new details key for each details hash", () => {
    const keys: unknown[] = [];
    keys.push(lookupContext.detailsKey());
    assertEqual(1, new Set(keys).size);

    lookupContext.locale = ":da";
    keys.push(lookupContext.detailsKey());
    assertEqual(2, new Set(keys).size);

    lookupContext.locale = ":en";
    keys.push(lookupContext.detailsKey());
    assertEqual(2, new Set(keys).size);

    lookupContext.formats = [":html"];
    keys.push(lookupContext.detailsKey());
    assertEqual(3, new Set(keys).size);

    lookupContext.formats = null;
    keys.push(lookupContext.detailsKey());
    assertEqual(3, new Set(keys).size);
  });

  it("uses details as part of cache key", () => {
    const fixtures = {
      "test/_foo.tse": "Foo",
      "test/_foo.da.tse": "Bar",
    };
    lookupContext = buildLookupContext([new FixtureResolver(fixtures)], {});

    let template = lookupContext.find("foo", ["test"], true) as Template;
    const originalTemplate = template;
    assertEqual("Foo", template.source);

    template = lookupContext.find("foo", ["test"], true) as Template;
    assertSame(originalTemplate, template);

    lookupContext.locale = ":da";
    template = lookupContext.find("foo", ["test"], true) as Template;
    assertEqual("Bar", template.source);

    lookupContext.locale = ":en";
    template = lookupContext.find("foo", ["test"], true) as Template;
    assertSame(originalTemplate, template);
  });

  it("can disable the cache on demand", () => {
    lookupContext = buildLookupContext([new FixtureResolver({ "test/_foo.tse": "Foo" })], {});
    const oldTemplate = lookupContext.find("foo", ["test"], true);

    let template = lookupContext.find("foo", ["test"], true);
    assertEqual(template, oldTemplate);

    assert(lookupContext.cache);
    template = lookupContext.disableCache(() => {
      assertNot(lookupContext.cache);
      return lookupContext.find("foo", ["test"], true);
    });
    assert(lookupContext.cache);

    assertNotEqual(template, oldTemplate);
  });

  it("responds to #prefixes", () => {
    assertEqual([], lookupContext.prefixes);
    lookupContext.prefixes = ["foo"];
    assertEqual(["foo"], lookupContext.prefixes);
  });
});

describe("TestMissingTemplate", () => {
  let lookupContext: LookupContext;

  beforeEach(() => {
    lookupContext = new LookupContext(["/Path/to/views"], {});
  });

  it("if no template was found we get a helpful error message including the inheritance chain", async () => {
    const e = await assertRaises([MissingTemplate], {}, () => {
      lookupContext.find("foo", ["parent", "child"]);
    });
    assertMatch(
      /Missing template parent\/foo, child\/foo with .*\n\nSearched in:\n {2}\* "\/Path\/to\/views"\n/,
      e.message,
    );
  });

  it("if no partial was found we get a helpful error message including the inheritance chain", async () => {
    const e = await assertRaises([MissingTemplate], {}, () => {
      lookupContext.find("foo", ["parent", "child"], true);
    });
    assertMatch(
      /Missing partial parent\/_foo, child\/_foo with .*\n\nSearched in:\n {2}\* "\/Path\/to\/views"\n/,
      e.message,
    );
  });

  it("if a single prefix is passed as a string and the lookup fails, MissingTemplate accepts it", async () => {
    const e = await assertRaises([MissingTemplate], {}, () => {
      const details = { handlers: [], formats: [], variants: [], locale: [] };
      lookupContext.viewPaths.find("foo", "parent", true, details, null, []);
    });
    assertMatch(
      /Missing partial parent\/_foo with .*\n\nSearched in:\n {2}\* "\/Path\/to\/views"\n/,
      e.message,
    );
  });
});
