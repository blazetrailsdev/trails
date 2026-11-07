import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18n } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { FileUtils, Pathname, include, includedModules } from "@blazetrails/ruby-compat";
import { Rack, type Generation } from "../../test-helpers/isolation/abstract-unit.js";
import { Trailtie as I18nRailtie } from "../../trailties/i18n.js";
import { Trails } from "../../trails.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface I18nTest extends Generation, Pick<Rack, "_app" | "get" | "extractBody"> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class I18nTest extends TestCase {
  async loadApp(): Promise<void> {
    await import(`${await this.appPath()}/config/environment.ts`);
  }

  app(): unknown {
    return (this._app ??= Trails.application as never);
  }

  assertFallbacks(fallbacks: Record<string, string[]>): void {
    for (const [locale, expected] of Object.entries(fallbacks)) {
      const actual = I18n.fallbacks().get(locale);
      expect(
        actual,
        `expected fallbacks for ${locale} to be ${JSON.stringify(expected)}, but were ${JSON.stringify(actual)}`,
      ).toEqual(expected);
    }
  }

  assertNoFallbacks(): void {
    expect(includedModules(I18n.backend().constructor as { prototype: object })).not.toContain(
      I18n.Fallbacks,
    );
  }
}
include(I18nTest, Isolation);
include(I18nTest, Rack);
registerSpecType(/^I18nTest$/, I18nTest);

describe("I18nTest", { timeout: 120_000 }, () => {
  let t: I18nTest;

  beforeEach(async () => {
    t = new I18nTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
    await import("../../all.js");
  });

  afterEach(() => t.teardownApp());

  it.skip("setting another default locale", async () => {
    await t.addToConfig(`
        this.config.i18n.defaultLocale = "de";
`);

    await t.loadApp();
    expect(I18n.defaultLocale()).toBe("de");
  });

  it("no config locales directory present should return empty load path", async () => {
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/locales`);
    await t.loadApp();
    expect(Trails.application!.config.i18n.loadPath).toEqual([]);
  });

  it.skip("locale files should be added to the load path", async () => {
    await t.appFile("config/another_locale.yml", "en:\nfoo: ~");

    await t.addToConfig(`
        this.config.i18n.loadPath.push(this.config.root.join("config/another_locale.yml").toString());
`);

    await t.loadApp();
    const appPath = await t.appPath();
    expect(Trails.application!.config.i18n.loadPath).toEqual([
      `${appPath}/config/locales/en.yml`,
      `${appPath}/config/another_locale.yml`,
    ]);

    expect(I18n.loadPath()).toContain(`${appPath}/config/locales/en.yml`);
    expect(I18n.loadPath()).toContain(`${appPath}/config/another_locale.yml`);
  });

  it.skip("load_path handles Pathname argument correctly", async () => {
    await t.appFile("config/another_locale.yml", "en:\nfoo: ~");

    await t.addToConfig(`
        this.config.i18n.loadPath.push(this.config.root.join("config/another_locale.yml"));
`);

    await t.loadApp();
    const appPath = await t.appPath();
    expect(Trails.application!.config.i18n.loadPath).toEqual([
      `${appPath}/config/locales/en.yml`,
      new Pathname(`${appPath}/config/another_locale.yml`),
    ]);

    expect(I18n.loadPath()).toContain(`${appPath}/config/locales/en.yml`);
    expect(I18n.loadPath()).toContainEqual(new Pathname(`${appPath}/config/another_locale.yml`));
  });

  it.skip("load_path is populated before eager loaded models", async () => {
    await t.addToConfig(`
        this.config.enableReloading = false;
`);

    await t.appFile("config/locales/en.yml", `en:\n  foo: "1"\n`);

    await t.appFile(
      "app/models/foo.ts",
      `import { I18n } from "@blazetrails/activesupport";
import { ActiveRecord } from "@blazetrails/activerecord";
export class Foo extends ActiveRecord.Base {
  static _foo = I18n.t("foo");
}
`,
    );

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application.routes.draw(function () {
  this.get("/i18n", { to: async () => [200, {}, [(await import("../app/models/foo.ts")).Foo._foo]] });
});
`,
    );

    await t.loadApp();
    t.app();

    const response = await t.get("/i18n");
    expect(await t.extractBody(response)).toBe("1");
  });

  it.skip("locales are reloaded if they change between requests", async () => {
    await t.addToConfig(`
        this.config.enableReloading = true;
`);

    await t.appFile("config/locales/en.yml", `en:\n  foo: "1"\n`);

    await t.appFile(
      "config/routes.ts",
      `import { I18n } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";
Trails.application.routes.draw(function () {
  this.get("/i18n", { to: () => [200, {}, [I18n.t("foo")]] });
});
`,
    );

    await t.loadApp();
    t.app();

    expect(await t.extractBody(await t.get("/i18n"))).toBe("1");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await t.appFile("config/locales/en.yml", `en:\n  foo: "2"\n`);

    expect(await t.extractBody(await t.get("/i18n"))).toBe("2");
  });

  it.skip("new locale files are loaded", async () => {
    await t.addToConfig(`
        this.config.enableReloading = true;
`);

    await t.appFile("config/locales/en.yml", `en:\n  foo: "1"\n`);

    await t.appFile(
      "config/routes.ts",
      `import { I18n } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";
Trails.application.routes.draw(function () {
  this.get("/i18n", { to: () => [200, {}, [I18n.t("foo")]] });
});
`,
    );

    await t.loadApp();
    t.app();

    expect(await t.extractBody(await t.get("/i18n"))).toBe("1");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await t.removeFile("config/locales/en.yml");
    await t.appFile("config/locales/custom.en.yml", `en:\n  foo: "2"\n`);

    expect(await t.extractBody(await t.get("/i18n"))).toBe("2");
  });

  it.skip("I18n.load_path is reloaded", async () => {
    await t.addToConfig(`
        this.config.enableReloading = true;
`);

    await t.appFile("config/locales/en.yml", `en:\n  foo: "1"\n`);

    await t.appFile(
      "config/routes.ts",
      `import { I18n } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";
Trails.application.routes.draw(function () {
  this.get("/i18n", { to: () => [200, {}, [JSON.stringify(I18n.loadPath())]] });
});
`,
    );

    await t.loadApp();
    t.app();

    let body = await t.extractBody(await t.get("/i18n"));

    expect(body).toMatch("en.yml");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await t.appFile("config/locales/fr.yml", `fr:\n  foo: "2"\n`);

    body = await t.extractBody(await t.get("/i18n"));
    expect(body).toMatch("fr.yml");
    expect(body).toMatch("en.yml");
  });

  it.skip("not using config.i18n.fallbacks does not initialize I18n.fallbacks", async () => {
    I18n.setBackend(new (class extends I18n.Simple {})());
    await t.loadApp();
    t.assertNoFallbacks();
  });

  it.skip("config.i18n.fallbacks = true initializes I18n.fallbacks with default settings", async () => {
    (I18nRailtie.config.i18n as unknown as Record<string, unknown>).fallbacks = true;
    await t.loadApp();
    expect(includedModules(I18n.backend().constructor as { prototype: object })).toContain(
      I18n.Fallbacks,
    );
    t.assertFallbacks({ de: ["de", "en"] });
  });

  it.skip("config.i18n.fallbacks = true initializes I18n.fallbacks with default settings even when backend changes", async () => {
    (I18nRailtie.config.i18n as unknown as Record<string, unknown>).fallbacks = true;
    (I18nRailtie.config.i18n as unknown as Record<string, unknown>).backend = new (class
      extends I18n.Simple {})();
    await t.loadApp();
    expect(includedModules(I18n.backend().constructor as { prototype: object })).toContain(
      I18n.Fallbacks,
    );
    t.assertFallbacks({ de: ["de", "en"] });
  });

  it.skip("config.i18n.fallbacks.defaults = [:'en-US'] initializes fallbacks with en-US as a fallback default", async () => {
    (
      (I18nRailtie.config.i18n as unknown as Record<string, unknown>).fallbacks as Record<
        string,
        unknown
      >
    ).defaults = ["en-US"];
    await t.loadApp();
    t.assertFallbacks({ de: ["de", "en-US", "en"] });
  });

  it.skip("config.i18n.fallbacks.map = { :ca => :'es-ES' } initializes fallbacks with a mapping ca => es-ES", async () => {
    (
      (I18nRailtie.config.i18n as unknown as Record<string, unknown>).fallbacks as Record<
        string,
        unknown
      >
    ).map = { ca: "es-ES" };
    await t.loadApp();
    t.assertFallbacks({ ca: ["ca", "es-ES", "es"] });
  });

  it.skip("[shortcut] config.i18n.fallbacks = [:'en-US'] initializes fallbacks with en-US as a fallback default", async () => {
    (I18nRailtie.config.i18n as unknown as Record<string, unknown>).fallbacks = ["en-US"];
    await t.loadApp();
    t.assertFallbacks({ de: ["de", "en-US", "en"] });
  });

  it.skip("[shortcut] config.i18n.fallbacks = [{ :ca => :'es-ES' }] initializes fallbacks with a mapping ca => es-ES", async () => {
    (I18nRailtie.config.i18n as unknown as Record<string, unknown>).fallbacks = [{ ca: "es-ES" }];
    await t.loadApp();
    t.assertFallbacks({ ca: ["ca", "es-ES", "es"] });
  });

  it.skip("[shortcut] config.i18n.fallbacks = [:'en-US', { :ca => :'es-ES' }] initializes fallbacks with the given arguments", async () => {
    (I18nRailtie.config.i18n as unknown as Record<string, unknown>).fallbacks = [
      "en-US",
      { ca: "es-ES" },
    ];
    await t.loadApp();
    t.assertFallbacks({ ca: ["ca", "es-ES", "es", "en-US", "en"] });
  });

  it.skip("[shortcut] config.i18n.fallbacks = { ca: :en } initializes fallbacks with a mapping ca => :en", async () => {
    (I18nRailtie.config.i18n as unknown as Record<string, unknown>).fallbacks = { ca: "en" };
    await t.loadApp();
    t.assertFallbacks({ ca: ["ca", "en"] });
  });

  it.skip("disable config.i18n.enforce_available_locales", async () => {
    await t.addToConfig(`
        this.config.i18n.enforceAvailableLocales = false;
        this.config.i18n.defaultLocale = "fr";
`);

    await t.loadApp();
    expect(I18n.enforceAvailableLocales()).toBe(false);

    expect(() => I18n.setLocale("es")).not.toThrow();
  });

  it("default config.i18n.enforce_available_locales does not override I18n.enforce_available_locales", async () => {
    I18n.setEnforceAvailableLocales(false);

    await t.addToConfig(`
        this.config.i18n.defaultLocale = "fr";
`);

    await t.loadApp();
    expect(I18n.enforceAvailableLocales()).toBe(false);

    expect(() => I18n.setLocale("es")).not.toThrow();
  });
});
