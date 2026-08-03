/**
 * The `InvalidLocaleData` arms of `load_yml` / `load_file` and the YAML subset
 * the reader accepts — the gem gets these from Psych, so they are pinned here.
 */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { Simple } from "./simple.js";
import { config, reloadBang, resetConfig } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { InvalidLocaleData } from "../exceptions.js";
import { preloadTranslationFiles, registerFileReader } from "./base.js";
import { parseYaml } from "../yaml.js";

function localesDir(): string {
  return new URL("../test-data/locales", import.meta.url).pathname;
}

describe("I18n::Backend::Base file loading", () => {
  let backend: Simple;

  beforeEach(async () => {
    resetConfig();
    resetClassConfig();
    registerFileReader((filename) => readFile(filename, "utf8"));
    await preloadTranslationFiles(
      ["en.yml", "fr.yml", "invalid/empty.yml", "invalid/syntax.yml"].map(
        (name) => `${localesDir()}/${name}`,
      ),
    );
    backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
  });

  it("raises InvalidLocaleData given a YAML file that is empty", () => {
    expect(() => backend.loadTranslations(`${localesDir()}/invalid/empty.yml`)).toThrow(
      InvalidLocaleData,
    );
  });

  it("raises InvalidLocaleData naming the file given a YAML syntax error", () => {
    const filename = `${localesDir()}/invalid/syntax.yml`;
    expect(() => backend.loadTranslations(filename)).toThrow(
      new RegExp(`^can not load translations from ${filename}: `),
    );
  });

  it("yields each filename and its data to the block", () => {
    const yielded: unknown[] = [];
    const fr = `${localesDir()}/fr.yml`;
    backend.loadTranslations(fr, (...args: unknown[]) => yielded.push(args));
    expect(yielded).toEqual([[fr, { fr: { animal: { dog: "chien" } } }]]);
  });

  it("refuses a lazy lookup while I18n.load_path is unread", () => {
    config().loadPath = [`${localesDir()}/never-preloaded.yml`];
    expect(() => backend.translate("en", "foo.bar")).toThrow(
      /await I18n.preloadTranslationFiles\(\)/,
    );
  });

  it("serves lookups after an awaited preload of I18n.load_path", () => {
    config().loadPath = [`${localesDir()}/en.yml`];
    expect(backend.translate("en", "foo.bar")).toBe("baz");
    expect(backend.initialized()).toBe(true);
  });

  it("re-reads I18n.load_path on reloadBang", async () => {
    let body = "en:\n  foo:\n    bar: baz\n";
    registerFileReader(() => Promise.resolve(body));
    config().loadPath = ["mutable.yml"];
    await preloadTranslationFiles();
    expect(backend.translate("en", "foo.bar")).toBe("baz");

    body = "en:\n  foo:\n    bar: qux\n";
    await reloadBang();
    expect(backend.translate("en", "foo.bar")).toBe("qux");
  });

  it("re-reads I18n.load_path on reloadBang with an eager loaded backend", async () => {
    let body = "en:\n  foo:\n    bar: baz\n";
    registerFileReader(() => Promise.resolve(body));
    config().loadPath = ["mutable.yml"];
    await preloadTranslationFiles();
    backend.eagerLoadBang();
    expect(backend.translate("en", "foo.bar")).toBe("baz");

    body = "en:\n  foo:\n    bar: qux\n";
    await reloadBang();
    expect(backend.initialized()).toBe(true);
    expect(backend.translate("en", "foo.bar")).toBe("qux");
  });

  it("leaves the lazy-init guard armed when the load path holds an invalid file", () => {
    config().loadPath = [`${localesDir()}/invalid/syntax.yml`];
    expect(() => backend.translate("en", "foo.bar")).toThrow(InvalidLocaleData);
    expect(backend.initialized()).toBe(false);
  });

  describe("the YAML subset", () => {
    // The flow collections come from vendor/rails/activesupport/lib/
    // active_support/locale/en.yml, which every other shape here also appears in.
    it("reads the mappings, sequences and scalars Rails' locale files use", () => {
      const source =
        "# a comment\nen:\n  day_names: [Sunday, Monday, Tuesday]\n" +
        "  month_names: [~, January, February]\n  order:\n    - year\n    - month\n" +
        "  quoted: 'it''s here'  # trailing comment\n  escaped: \"a\\nb\"\n" +
        "  blank:\n  flag: true\n  count: 42\n  ratio: 1.5\n" +
        "  padded: 01\n  hash_in_value: not#a#marker\n";
      expect(parseYaml(source)).toEqual({
        en: {
          day_names: ["Sunday", "Monday", "Tuesday"],
          month_names: [null, "January", "February"],
          order: ["year", "month"],
          quoted: "it's here",
          escaped: "a\nb",
          blank: null,
          flag: true,
          count: 42,
          ratio: 1.5,
          padded: "01",
          hash_in_value: "not#a#marker",
        },
      });
    });

    it("raises outside the supported subset", () => {
      expect(parseYaml("---\n# nothing here\n")).toBeNull();
      expect(() => parseYaml("en:\n foo: foo\n    bar:\n")).toThrow(/inconsistent indentation/);
      expect(() => parseYaml("en: &anchor\n")).toThrow(/not supported/);
      expect(() => parseYaml("en:\n  just a scalar\n")).toThrow(/expected a `key: value`/);
    });
  });
});
