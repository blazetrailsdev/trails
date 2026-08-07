/**
 * The `InvalidLocaleData` arms of `load_yml` / `load_file`, and the Psych input
 * surface `load_yml` accepts by handing the file straight to a YAML parser
 * (base.rb:261-270) — pinned here because the gem gets both from Psych, so
 * anchors, aliases, tags, block scalars and mapping entries inside a block
 * sequence all load rather than raising.
 */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { Simple } from "./simple.js";
import { config, eagerLoadBang, reloadBang, resetConfig } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { InvalidLocaleData, UnknownFileType } from "../exceptions.js";
import { preloadTranslationFiles, registerFileReader, registerLocaleModule } from "./base.js";

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
      ["en.yml", "fr.yml", "psych.yml", "invalid/empty.yml", "invalid/syntax.yml"].map(
        (name) => `${localesDir()}/${name}`,
      ),
    );
    backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
  });

  it("load_yaml takes a filename and keeps the load_yml entry it aliased", () => {
    class Overriding extends Simple {
      protected override loadYml(_filename: string): [unknown, boolean] {
        return [{ en: { overridden: true } }, false];
      }
    }
    const filename = `${localesDir()}/en.yml`;
    const overriding = new Overriding() as unknown as {
      loadYaml(f: string): [unknown, boolean];
    };
    expect(overriding.loadYaml(filename)).toEqual([{ en: { foo: { bar: "baz" } } }, true]);
  });

  it("load_yml freezes the parsed data deeply", () => {
    const filename = `${localesDir()}/en.yml`;
    const loading = backend as unknown as { loadYml(f: string): [unknown, boolean] };
    const [data, keysSymbolized] = loading.loadYml(filename);
    expect(keysSymbolized).toBe(true);
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen((data as { en: { foo: unknown } }).en.foo)).toBe(true);
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
    config().loadPath.push(`${localesDir()}/never-preloaded.yml`);
    expect(() => backend.translate("en", "foo.bar")).toThrow(
      /await I18n.preloadTranslationFiles\(\)/,
    );
  });

  it("serves lookups after an awaited preload of I18n.load_path", async () => {
    await config().setLoadPath([`${localesDir()}/en.yml`]);
    expect(backend.translate("en", "foo.bar")).toBe("baz");
    expect(backend.initialized()).toBe(true);
  });

  it("re-reads I18n.load_path on reloadBang", async () => {
    let body = "en:\n  foo:\n    bar: baz\n";
    registerFileReader(() => Promise.resolve(body));
    await config().setLoadPath(["mutable.yml"]);
    expect(backend.translate("en", "foo.bar")).toBe("baz");

    body = "en:\n  foo:\n    bar: qux\n";
    await reloadBang();
    expect(backend.translate("en", "foo.bar")).toBe("qux");
  });

  it("re-reads I18n.load_path on reloadBang with an eager loaded backend", async () => {
    let body = "en:\n  foo:\n    bar: baz\n";
    registerFileReader(() => Promise.resolve(body));
    await config().setLoadPath(["mutable.yml"]);
    await backend.eagerLoadBang();
    expect(backend.translate("en", "foo.bar")).toBe("baz");

    body = "en:\n  foo:\n    bar: qux\n";
    await reloadBang();
    expect(backend.initialized()).toBe(true);
    expect(backend.translate("en", "foo.bar")).toBe("qux");
  });

  it("reads I18n.load_path once per reload, and not again on eagerLoadBang", async () => {
    let reads = 0;
    registerFileReader(() => {
      reads += 1;
      return Promise.resolve("en:\n  foo:\n    bar: baz\n");
    });
    await config().setLoadPath(["mutable.yml"]);
    reads = 0;

    await eagerLoadBang();
    expect(reads).toBe(0);

    await reloadBang();
    expect(reads).toBe(1);
  });

  it("serves the mutated file on an eagerLoadBang that follows a reloadBang", async () => {
    let body = "en:\n  foo:\n    bar: baz\n";
    registerFileReader(() => Promise.resolve(body));
    await config().setLoadPath(["mutable.yml"]);
    expect(backend.translate("en", "foo.bar")).toBe("baz");

    body = "en:\n  foo:\n    bar: qux\n";
    await reloadBang();
    await eagerLoadBang();
    expect(backend.translate("en", "foo.bar")).toBe("qux");
  });

  it("leaves the lazy-init guard armed when the load path holds an invalid file", async () => {
    await config().setLoadPath([`${localesDir()}/invalid/syntax.yml`]);
    expect(() => backend.translate("en", "foo.bar")).toThrow(InvalidLocaleData);
    expect(backend.initialized()).toBe(false);
  });

  // `registerLocaleModule` / `loadJs` stand in for the gem's `load_rb`
  // (base.rb:254-256, dispatched by `load_file`'s extension arms at :240-247).
  // Every test here names its own `bundled/*` entry: the registry is a module
  // singleton with no reset, so a shared name would leak into its siblings.
  describe("the locale-module registry", () => {
    it("serves a registered module without reaching import()", () => {
      registerLocaleModule("bundled/registered.js", { en: { bundled: { greeting: "hi" } } });
      config().loadPath.push("bundled/registered.js");
      expect(backend.translate("en", "bundled.greeting")).toBe("hi");
    });

    it("refuses a module the load path names but nothing registered", () => {
      config().loadPath.push("bundled/unregistered.js");
      expect(() => backend.translate("en", "bundled.greeting")).toThrow(
        /register it with I18n.registerLocaleModule\(\)/,
      );
      expect(() => backend.translate("en", "bundled.greeting")).not.toThrow(UnknownFileType);
    });

    it("raises InvalidLocaleData given a module whose export is not a hash", () => {
      registerLocaleModule("bundled/non-hash.js", "en:\n  bundled:\n    greeting: hi\n");
      expect(() => backend.loadTranslations("bundled/non-hash.js")).toThrow(InvalidLocaleData);
      expect(() => backend.loadTranslations("bundled/non-hash.js")).toThrow(
        "expects it to return a hash, but does not",
      );
    });

    it("loads a module the host imported off disk under its emitted .js name", async () => {
      const { en } = (await import("../test-data/locales/en.js")) as {
        en: Record<string, unknown>;
      };
      registerLocaleModule(`${localesDir()}/en.js`, { en });
      config().loadPath.push(`${localesDir()}/en.js`);
      expect(backend.translate("en", "fuh.bah")).toBe("bas");
    });
  });

  it("loads the constructs Psych accepts beyond plain block mappings", () => {
    backend.loadTranslations(`${localesDir()}/psych.yml`);
    expect(backend.translate("en", "greeting")).toBe("Hello");
    expect(backend.translate("en", "aliased")).toBe("Hello");
    expect(backend.translate("en", "farewell")).toBe("Bye\nnow");
    expect(backend.translate("en", "entries")).toEqual([{ key: "value" }]);
    expect(backend.translate("en", "tagged")).toBe("42");
  });
});
