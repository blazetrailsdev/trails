import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import {
  CATALOGUE_SOURCE,
  NON_TABLE_CATALOGUES,
  TABLE_NAME_CATALOGUES,
} from "./canonical-catalogue-sources.mjs";

const packagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packages");

// A catalogue read: something in a relation position (`FROM x`, `JOIN x`) whose
// name belongs to one of the catalogue families. Restricting to the relation
// position is what makes this measurable — `pg_` and `sqlite_` also prefix
// constants (`SQLITE_OPEN_URI`), env var names (`PG_TEST_URL`) and functions,
// none of which a sweep can read a table name out of.
const RELATION =
  /\b(?:from|join)\s+(pg_[a-z_]+|sqlite_[a-z_]+|pragma_[a-z_]+|information_schema\.[a-z_]+)\b/gi;

async function* tsFiles(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* tsFiles(full);
    else if (full.endsWith(".ts")) yield full;
  }
}

async function catalogueReads() {
  const found = new Map();
  for await (const file of tsFiles(packagesDir)) {
    const source = await fs.readFile(file, "utf8");
    for (const [, name] of source.matchAll(RELATION)) {
      const key = name.toLowerCase();
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(path.relative(packagesDir, file));
    }
  }
  return found;
}

describe("canonical catalogue sources", () => {
  it("classifies every catalogue relation read under packages/", async () => {
    const unclassified = [];
    for (const [name, files] of await catalogueReads()) {
      const known = CATALOGUE_SOURCE.test(name) || Object.hasOwn(NON_TABLE_CATALOGUES, name);
      if (!known) unclassified.push(`${name} (e.g. ${[...files][0]})`);
    }
    expect(
      unclassified,
      "A catalogue relation is read under packages/ that eslint/canonical-catalogue-sources.mjs " +
        "does not classify. If a SELECT against it can return a TABLE NAME, add it to " +
        "TABLE_NAME_CATALOGUES so require-canonical-rebuild sees sweeps driven by it; otherwise " +
        "add it to NON_TABLE_CATALOGUES with the reason it cannot name a table.",
    ).toEqual([]);
  });

  it("never classifies a relation as both able and unable to name a table", () => {
    const both = TABLE_NAME_CATALOGUES.filter((name) => Object.hasOwn(NON_TABLE_CATALOGUES, name));
    expect(both).toEqual([]);
  });

  it("matches every table-name catalogue and no non-table one", () => {
    for (const name of TABLE_NAME_CATALOGUES) expect(CATALOGUE_SOURCE.test(name)).toBe(true);
    for (const name of Object.keys(NON_TABLE_CATALOGUES)) {
      expect(CATALOGUE_SOURCE.test(name), `${name} is classified as unable to name a table`).toBe(
        false,
      );
    }
  });
});
