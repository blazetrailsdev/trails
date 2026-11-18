import * as TestCase from "../support/test-case.js";
import { Hash, regexpEscape } from "@blazetrails/ruby-compat";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, afterEach } from "vitest";
import { LazyLoadable } from "../../lib/backend/lazy-loadable.js";
import { config, setLoadPath, t, withLocale } from "../../lib/i18n.js";
import { InvalidFilenames, UnknownFileType, UnsupportedMethod } from "../../lib/exceptions.js";
import { preloadTranslationFiles, registerFileReader } from "../../lib/backend/base.js";
import type { TranslationData } from "../../lib/utils.js";

function localesDir(): string {
  return new URL("../test-data/locales", import.meta.url).pathname;
}

function h(...pairs: [unknown, unknown][]): Hash<unknown, unknown> {
  const hash = new Hash<unknown, unknown>();
  for (const [k, v] of pairs) hash.set(k, v);
  return hash;
}

describe("I18nBackendLazyLoadableTest", () => {
  const tempFiles = new Map<string, string>();
  let tempCount = 0;
  let lazyModeBackend: LazyLoadable;
  let eagerModeBackend: LazyLoadable;
  let backend: LazyLoadable;

  beforeEach(async () => {
    await TestCase.setup();
    registerFileReader(async (filename) =>
      tempFiles.has(filename) ? tempFiles.get(filename)! : readFile(filename, "utf8"),
    );

    lazyModeBackend = new LazyLoadable({ lazyLoad: true });
    eagerModeBackend = new LazyLoadable({ lazyLoad: false });

    await setLoadPath([
      `${localesDir()}/en.yml`,
      `${localesDir()}/en.yaml`,
      `${localesDir()}/fr.yml`,
    ]);
  });
  afterEach(TestCase.teardown);

  function translations(): TranslationData | undefined {
    return (backend as unknown as { translationsStore: TranslationData | undefined })
      .translationsStore;
  }

  async function withLazyMode(block: () => Promise<void> | void): Promise<void> {
    backend = config().backend = lazyModeBackend;

    await block();
  }

  async function withEagerMode(block: () => Promise<void> | void): Promise<void> {
    backend = config().backend = eagerModeBackend;

    await block();
  }

  async function withTranslationFileInLoadPath(
    name: [string, string],
    _tmpdir: string | null | undefined,
    fileContents: string,
    block: (path: string) => Promise<void> | void,
  ): Promise<void> {
    await backend.reloadBang();

    const path = `/tmp/${name[0]}${++tempCount}${name[1]}`;
    tempFiles.set(path, fileContents);

    config().loadPath.push(path);
    await preloadTranslationFiles(path);

    await block(path);

    config().loadPath.splice(config().loadPath.indexOf(path), 1);
  }

  it("lazy mode: only loads translations for current locale", async () => {
    await withLazyMode(async () => {
      await backend.reloadBang();

      expect(translations()).toBeUndefined();

      withLocale("en", () => t("foo.bar"));
      expect(translations()).toEqual(h([":en", h([":foo", h([":bar", "baz"])])]));
    });
  });

  it("lazy mode: merges translations for current locale with translations already existing in memory", async () => {
    await withLazyMode(async () => {
      await backend.reloadBang();

      withLocale("en", () => t("foo.bar"));
      expect(translations()).toEqual(h([":en", h([":foo", h([":bar", "baz"])])]));

      withLocale("fr", () => t("animal.dog"));
      expect(translations()).toEqual(
        h([":en", h([":foo", h([":bar", "baz"])])], [":fr", h([":animal", h([":dog", "chien"])])]),
      );
    });
  });

  it("lazy mode: #initialized? responds based on whether current locale is initialized", async () => {
    await withLazyMode(async () => {
      await backend.reloadBang();

      withLocale("en", () => {
        expect(backend.initialized()).toBeFalsy();
        t("foo.bar");
        expect(backend.initialized()).toBeTruthy();
      });

      withLocale("fr", () => {
        expect(backend.initialized()).toBeFalsy();
      });
    });
  });

  it("lazy mode: reload! uninitializes all locales", async () => {
    await withLazyMode(async () => {
      withLocale("en", () => t("foo.bar"));
      withLocale("fr", () => t("animal.dog"));

      await backend.reloadBang();

      withLocale("en", () => {
        expect(backend.initialized()).toBeFalsy();
      });

      withLocale("fr", () => {
        expect(backend.initialized()).toBeFalsy();
      });
    });
  });

  it("lazy mode: eager_load! raises UnsupportedMethod exception", async () => {
    await withLazyMode(async () => {
      const promise = backend.eagerLoadBang();
      await expect(promise).rejects.toThrow(UnsupportedMethod);
      const exception = await promise.catch((e: unknown) => e);
      const expectedMsg =
        "LazyLoadable does not support the #eager_load! method. Cannot eager load translations because backend was configured with lazy_load: true.";
      expect((exception as Error).message).toBe(expectedMsg);
    });
  });

  it("lazy mode: loads translations from files that start with current locale identifier", async () => {
    await withLazyMode(async () => {
      const fileContents = "---\nen:\n  alice: bob\n";

      const invalidFiles: { filename: [string, string]; dir?: string }[] = [
        { filename: ["translation", ".yml"] },
        { filename: ["translation", ".unsupported"] },
      ];

      for (const file of invalidFiles) {
        await withTranslationFileInLoadPath(file.filename, file.dir, fileContents, () => {
          withLocale("en", () => t("foo.bar"));
          expect(translations()).toEqual(h([":en", h([":foo", h([":bar", "baz"])])]));
        });
      }

      const validFiles: { filename: [string, string]; dir?: string }[] = [
        { filename: ["en_translation", ".yml"] },
        { filename: ["en_", ".yml"] },
      ];

      for (const file of validFiles) {
        await withTranslationFileInLoadPath(file.filename, file.dir, fileContents, () => {
          withLocale("en", () => t("foo.bar"));
          expect(translations()).toEqual(
            h([":en", h([":foo", h([":bar", "baz"])], [":alice", "bob"])]),
          );
        });
      }
    });
  });

  it("lazy mode: files with unsupported extensions raise UnknownFileType error", async () => {
    await withLazyMode(async () => {
      const fileContents = "---\nen:\n  alice: bob\n";
      const filename: [string, string] = ["en_translation", ".unsupported"];

      await withTranslationFileInLoadPath(filename, null, fileContents, () => {
        expect(() => t("foo.bar")).toThrow(UnknownFileType);
      });
    });
  });

  it("lazy mode: #available_locales returns all locales available from load path irrespective of current locale", async () => {
    await withLazyMode(() => {
      withLocale("en", () => expect(backend.availableLocales()).toEqual(["en", "fr"]));
      withLocale("fr", () => expect(backend.availableLocales()).toEqual(["en", "fr"]));
    });
  });

  it("lazy mode: raises error if translations loaded don't correspond to locale extracted from filename", async () => {
    const filename: [string, string] = ["en_", ".yml"];
    const fileContents = "---\nfr:\n  dog: chien\n";

    await withLazyMode(async () => {
      await withTranslationFileInLoadPath(filename, null, fileContents, (filePath) => {
        let exception: unknown;
        expect(() => {
          try {
            t("foo.bar");
          } catch (e) {
            exception = e;
            throw e;
          }
        }).toThrow(InvalidFilenames);

        const expectedMessage = new RegExp(
          `${regexpEscape(filePath)} can only load translations for "en"\\. Found translations for: \\[:fr\\]`,
        );
        expect((exception as Error).message).toMatch(expectedMessage);
      });
    });
  });

  it("lazy mode: raises error if translations for more than one locale are loaded from a single file", async () => {
    const filename: [string, string] = ["en_", ".yml"];
    const fileContents = "---\nen:\n  alice: bob\nfr:\n  dog: chien\nde:\n  cat: katze\n";

    await withLazyMode(async () => {
      await withTranslationFileInLoadPath(filename, null, fileContents, (filePath) => {
        let exception: unknown;
        expect(() => {
          try {
            t("foo.bar");
          } catch (e) {
            exception = e;
            throw e;
          }
        }).toThrow(InvalidFilenames);

        const expectedMessage = new RegExp(
          `${regexpEscape(filePath)} can only load translations for "en"\\. Found translations for: \\[:fr, :de\\]`,
        );
        expect((exception as Error).message).toMatch(expectedMessage);
      });
    });
  });

  it("lazy mode: #lookup lazy loads translations for supplied locale", async () => {
    await withLazyMode(async () => {
      await backend.reloadBang();
      expect(translations()).toBeUndefined();

      withLocale("en", () => {
        expect(
          (backend as unknown as { lookup(l: string, k: string): unknown }).lookup(
            "fr",
            "animal.dog",
          ),
        ).toBe("chien");
      });

      expect(translations()).toEqual(h([":fr", h([":animal", h([":dog", "chien"])])]));
    });
  });

  it("eager mode: load all translations, irrespective of locale", async () => {
    await withEagerMode(async () => {
      await backend.reloadBang();

      expect(translations()).toBeUndefined();

      withLocale("en", () => t("foo.bar"));
      expect(translations()).toEqual(
        h([":en", h([":foo", h([":bar", "baz"])])], [":fr", h([":animal", h([":dog", "chien"])])]),
      );
    });
  });

  it("eager mode: raises error if locales loaded cannot be extracted from load path names", async () => {
    await withEagerMode(async () => {
      await backend.reloadBang();

      const contents = "---\nde:\n  cat: katze\n";

      await withTranslationFileInLoadPath(
        ["fr_translation", ".yml"],
        null,
        contents,
        (filePath) => {
          let exception: unknown;
          expect(() => {
            try {
              t("foo.bar");
            } catch (e) {
              exception = e;
              throw e;
            }
          }).toThrow(InvalidFilenames);

          const expectedMessage = new RegExp(
            `${regexpEscape(filePath)} can only load translations for "fr"\\. Found translations for: \\[:de\\]`,
          );
          expect((exception as Error).message).toMatch(expectedMessage);
        },
      );
    });
  });
});
