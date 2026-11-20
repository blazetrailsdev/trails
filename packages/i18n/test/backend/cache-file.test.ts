import { defineModule, include, rbCallSuper } from "@blazetrails/ruby-compat";
import { mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { preloadTranslationFiles, registerFileReader } from "../../lib/backend/base.js";
import { CacheFile } from "../../lib/backend/cache-file.js";
import { KeyValue, type Store } from "../../lib/backend/key-value.js";
import { Simple } from "../../lib/backend/simple.js";
import { config, setBackend, t } from "../../lib/i18n.js";
import * as TestCase from "../support/test-case.js";

interface Writes {
  writes: unknown[][];
  pathRoots?: string[] | null;
  loadTranslations(): void;
}

function countWritesStoreTranslations(this: Writes, ...args: unknown[]): unknown {
  const result = rbCallSuper(this, countWritesStoreTranslations, ...args);
  this.writes.push(args);
  return result;
}
const CountWrites = defineModule({ storeTranslations: countWritesStoreTranslations });

function localesDir(): string {
  return new URL("../test-data/locales", import.meta.url).pathname;
}

function cacheFileTest(
  name: string,
  setupBackendBang: () => Writes,
  loadTranslationsUnlessSimple: (backend: Writes) => void,
): void {
  describe(name, () => {
    let backend: Writes;
    beforeEach(async () => {
      await TestCase.setup();
      registerFileReader((filename) => readFile(filename, "utf8"));
    });
    afterEach(TestCase.teardown);

    it("load_translations caches loaded file contents", async () => {
      backend = setupBackendBang();
      await config().setLoadPath([localesDir() + "/en.yml"]);
      expect(backend.writes.length).toBe(0);

      loadTranslationsUnlessSimple(backend);
      expect(t("foo.bar")).toBe("baz");
      expect(backend.writes.length).toBe(2);

      backend.loadTranslations();
      expect(t("foo.bar")).toBe("baz");
      expect(backend.writes.length).toBe(2);
    });

    it("setting path_roots normalizes write key", async () => {
      backend = setupBackendBang();
      await config().setLoadPath([localesDir() + "/en.yml"]);
      backend.pathRoots = [localesDir()];
      backend.loadTranslations();
      expect(t("0/en\x01yml", { scope: "loadFile", locale: "i18n", default: null })).not.toBeNull();
    });

    it("load_translations caches file through updated modification time", async () => {
      backend = setupBackendBang();
      const file = `${await mkdtemp(`${tmpdir()}/test`)}/test.yml`;
      await writeFile(file, "en:\n  foo:\n    bar: baz\n");
      await config().setLoadPath([file]);
      expect(backend.writes.length).toBe(0);

      loadTranslationsUnlessSimple(backend);
      expect(t("foo.bar")).toBe("baz");
      expect(backend.writes.length).toBe(2);

      let now = Date.now() / 1000;
      await utimes(file, now + 1, now + 1);
      await preloadTranslationFiles();
      backend.loadTranslations();
      expect(t("foo.bar")).toBe("baz");
      expect(backend.writes.length).toBe(2);

      await writeFile(file, "en:\n  foo:\n    bar: baa\n");
      now = Date.now() / 1000;
      await utimes(file, now + 2, now + 2);
      await preloadTranslationFiles();
      backend.loadTranslations();
      expect(t("foo.bar")).toBe("baa");
      expect(backend.writes.length).toBe(4);
    });
  });
}

class SimpleBackend extends Simple {
  writes: unknown[][] = [];
}
include(SimpleBackend, CountWrites);
include(SimpleBackend, CacheFile);

class KeyValueBackend extends KeyValue {
  writes: unknown[][] = [];
  constructor() {
    super(new Map<string, string>() as Store);
  }
}
include(KeyValueBackend, CountWrites);
include(KeyValueBackend, CacheFile);

cacheFileTest(
  "SimpleCacheFileTest",
  () => {
    const backend = new SimpleBackend();
    setBackend(backend);
    return backend as unknown as Writes;
  },
  () => {},
);
cacheFileTest(
  "KeyValueCacheFileTest",
  () => {
    const backend = new KeyValueBackend();
    setBackend(backend);
    return backend as unknown as Writes;
  },
  (backend) => backend.loadTranslations(),
);
