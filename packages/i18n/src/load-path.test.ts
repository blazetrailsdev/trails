/**
 * Mirrors: i18n/test/i18n/load_path_test.rb
 *
 * Ruby reads a load-path entry with a synchronous `YAML.load_file`; trails
 * awaits the bytes once through `preloadTranslationFiles` and keeps every
 * ported body verbatim over them (see base.ts). `I18n.load_path =` is
 * `setLoadPath()` for the same reason — it reloads the backend, and a TS `set`
 * accessor cannot be awaited.
 *
 * `Pathname.new(path)` has no JS counterpart: a path is a String here, so both
 * Pathname cases push the same value `Dir[]` yields above them. The Ruby file
 * fixture is `en.rb`; trails authors it as TypeScript and registers it under
 * its emitted `en.js` name, the way backend/simple.test.ts does — so
 * `Dir[locales_dir + '/*.{rb,yml}']` is the `.js`/`.yml` entries of the
 * fixture directory, listed the way `Dir[]` sorts them.
 */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";

import { Simple } from "./backend/simple.js";
import {
  preloadTranslationFiles,
  registerFileReader,
  registerLocaleModule,
} from "./backend/base.js";
import { resetClassConfig } from "./config.js";
import { InvalidLocaleData } from "./exceptions.js";
import { config, resetConfig, setLocale, t } from "./i18n.js";
import { en } from "./test-data/locales/en.js";

function localesDir(): string {
  return new URL("./test-data/locales", import.meta.url).pathname;
}

describe("I18nLoadPathTest", () => {
  let backend: Simple;

  beforeEach(async () => {
    resetConfig();
    resetClassConfig();
    config().enforceAvailableLocales = false;
    registerFileReader((filename) => readFile(filename, "utf8"));
    await preloadTranslationFiles(
      ["en.yml", "fr.yml", "psych.yml", "invalid/empty.yml", "invalid/syntax.yml"].map(
        (name) => `${localesDir()}/${name}`,
      ),
    );
    registerLocaleModule(`${localesDir()}/en.js`, { en });
    setLocale("en");
    backend = new Simple();
    config().backend = backend;
    backend.storeTranslations("en", { foo: { bar: "bar", baz: "baz" } });
  });

  it("nested load paths do not break locale loading", async () => {
    await config().setLoadPath([[`${localesDir()}/en.yml`]]);
    expect(t("foo.bar")).toBe("baz");
  });

  it("loading an empty yml file raises an InvalidLocaleData exception", async () => {
    await config().setLoadPath([`${localesDir()}/invalid/empty.yml`]);
    expect(() => t("foo.bar", { default: "baz" })).toThrow(InvalidLocaleData);
  });

  it("loading an invalid yml file raises an InvalidLocaleData exception", async () => {
    await config().setLoadPath([`${localesDir()}/invalid/syntax.yml`]);
    expect(() => t("foo.bar", { default: "baz" })).toThrow(InvalidLocaleData);
  });

  it("adding arrays of filenames to the load path does not break locale loading", () => {
    config().loadPath.push(
      ["en.js", "en.yml", "fr.yml", "psych.yml"].map((name) => `${localesDir()}/${name}`),
    );
    expect(t("foo.bar")).toBe("baz");
  });

  it("adding Pathnames to the load path does not break YML file locale loading", () => {
    config().loadPath.push(`${localesDir()}/en.yml`);
    expect(t("foo.bar")).toBe("baz");
  });

  it("adding Pathnames to the load path does not break Ruby file locale loading", () => {
    config().loadPath.push(`${localesDir()}/en.js`);
    expect(t("fuh.bah")).toBe("bas");
  });
});
