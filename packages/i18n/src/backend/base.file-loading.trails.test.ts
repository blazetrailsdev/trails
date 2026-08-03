/**
 * The `InvalidLocaleData` arms of `load_yml` / `load_file` and the YAML subset
 * the reader accepts — the gem gets these from Psych, so they are pinned here.
 */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { Simple } from "./simple.js";
import { config, resetConfig } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { InvalidLocaleData } from "../exceptions.js";
import { registerFileReader } from "./base.js";
import { parseYaml } from "../yaml.js";

function localesDir(): string {
  return new URL("../test-data/locales", import.meta.url).pathname;
}

describe("I18n::Backend::Base file loading", () => {
  let backend: Simple;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    registerFileReader((filename) => readFile(filename, "utf8"));
    backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
  });

  it("raises InvalidLocaleData given a YAML file that is empty", async () => {
    await expect(
      backend.loadTranslations(`${localesDir()}/invalid/empty.yml`),
    ).rejects.toBeInstanceOf(InvalidLocaleData);
  });

  it("raises InvalidLocaleData naming the file given a YAML syntax error", async () => {
    const filename = `${localesDir()}/invalid/syntax.yml`;
    await expect(backend.loadTranslations(filename)).rejects.toThrow(
      new RegExp(`^can not load translations from ${filename}: `),
    );
  });

  it("yields each filename and its data to the block", async () => {
    const yielded: unknown[] = [];
    const fr = `${localesDir()}/fr.yml`;
    await backend.loadTranslations(fr, (...args: unknown[]) => yielded.push(args));
    expect(yielded).toEqual([[fr, { fr: { animal: { dog: "chien" } } }]]);
  });

  describe("the YAML subset", () => {
    it("reads nested mappings, sequences and scalars", () => {
      const source =
        "# a comment\nen:\n  day_names:\n    - Sunday\n    - Monday\n" +
        "  quoted: 'it''s here'  # trailing comment\n  escaped: \"a\\nb\"\n" +
        "  blank:\n  nothing: ~\n  flag: true\n  count: 42\n  ratio: 1.5\n" +
        "  padded: 01\n  hash_in_value: not#a#marker\n";
      const en = {
        day_names: ["Sunday", "Monday"],
        quoted: "it's here",
        escaped: "a\nb",
        blank: null,
        nothing: null,
        flag: true,
        count: 42,
        ratio: 1.5,
        padded: "01",
        hash_in_value: "not#a#marker",
      };
      expect(parseYaml(source)).toEqual({ en });
    });

    it("raises outside the supported subset", () => {
      expect(parseYaml("---\n# nothing here\n")).toBeNull();
      expect(() => parseYaml("en:\n foo: foo\n    bar:\n")).toThrow(/inconsistent indentation/);
      expect(() => parseYaml("en: &anchor\n")).toThrow(/not supported/);
      expect(() => parseYaml("en: [a, b]\n")).toThrow(/not supported/);
      expect(() => parseYaml("en:\n  just a scalar\n")).toThrow(/expected a `key: value`/);
    });
  });
});
