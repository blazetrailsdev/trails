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
      const files = found.get(key) ?? found.set(key, new Set()).get(key);
      files.add(path.relative(packagesDir, file));
    }
  }
  return found;
}

describe("canonical catalogue sources", () => {
  it("classifies every catalogue relation read under packages/", async () => {
    const reads = await catalogueReads();
    expect(
      reads.size,
      "the packages/ scan matched nothing — the RELATION probe stopped working",
    ).toBeGreaterThan(10);

    const unclassified = [];
    for (const [name, files] of reads) {
      const known = CATALOGUE_SOURCE.test(name) || Object.hasOwn(NON_TABLE_CATALOGUES, name);
      if (!known) unclassified.push(`${name} (e.g. ${[...files].sort()[0]})`);
    }
    expect(
      unclassified.sort(),
      "A catalogue relation is read in a relation position (FROM x / JOIN x) under packages/ that " +
        "eslint/canonical-catalogue-sources.mjs does not classify. require-canonical-rebuild can " +
        "only see a sweep whose catalogue it recognises, and that list rotted silently once " +
        "already (pragma_table_list was missing until review round 2 of PR #5519, which left the " +
        "whole SQLite lane blind) — this test exists so it cannot rot again. If a SELECT against " +
        "the relation below can return a TABLE NAME, add it to TABLE_NAME_CATALOGUES; otherwise " +
        "add it to NON_TABLE_CATALOGUES with the reason it cannot name a table.",
    ).toEqual([]);
  });

  it("never classifies a relation as both able and unable to name a table", () => {
    const both = TABLE_NAME_CATALOGUES.filter((name) => Object.hasOwn(NON_TABLE_CATALOGUES, name));
    expect(both).toEqual([]);
    expect(TABLE_NAME_CATALOGUES).toEqual([...new Set(TABLE_NAME_CATALOGUES)]);
  });

  it("matches every table-name catalogue and no non-table one", () => {
    for (const name of TABLE_NAME_CATALOGUES) {
      expect(CATALOGUE_SOURCE.test(name), `${name} must arm the sweep check`).toBe(true);
    }
    for (const [name, reason] of Object.entries(NON_TABLE_CATALOGUES)) {
      expect(CATALOGUE_SOURCE.test(name), `${name} is classified as unable to name a table`).toBe(
        false,
      );
      expect(reason.length, `${name} needs a reason, not an empty string`).toBeGreaterThan(0);
    }
  });

  it("does not match a longer name that merely starts with a catalogue", () => {
    expect(CATALOGUE_SOURCE.test("pg_tablespaces")).toBe(false);
    expect(CATALOGUE_SOURCE.test("sqlite_masterful")).toBe(false);
  });
});
