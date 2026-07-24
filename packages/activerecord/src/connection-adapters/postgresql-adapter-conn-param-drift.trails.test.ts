import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { createRequire } from "module";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

const require = createRequire(import.meta.url);

const PINNED_PG_VERSION = "8.20.0";

const PG_KEYWORD_SOURCES = [
  {
    module: "pg/lib/connection-parameters.js",
    firstLine: 59,
    lastLine: 127,
    patterns: [/val\('([a-zA-Z_]+)'/g, /config\.([a-zA-Z_]+)/g],
  },
  {
    module: "pg/lib/client.js",
    firstLine: 62,
    lastLine: 99,
    patterns: [/\bc\.([a-zA-Z_]+)/g],
  },
] as const;

const PG9_DEPRECATED_KEYWORDS = ["Promise", "connection"] as const;

async function deriveDriverKeywords(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const { module, firstLine, lastLine, patterns } of PG_KEYWORD_SOURCES) {
    const source = await readFile(require.resolve(module), "utf-8");
    const slice = source
      .split("\n")
      .slice(firstLine - 1, lastLine)
      .join("\n");
    for (const pattern of patterns) {
      for (const [, key] of slice.matchAll(pattern)) keys.add(key);
    }
  }
  return keys;
}

function allowlistKeywords(): Set<string> {
  return (
    PostgreSQLAdapter as unknown as {
      VALID_CONN_PARAM_KEYS: ReadonlySet<string>;
    }
  ).VALID_CONN_PARAM_KEYS as Set<string>;
}

function sorted(keys: Iterable<string>): string[] {
  return [...keys].sort();
}

const RECHECK_HINT = `re-derive from ${PG_KEYWORD_SOURCES.map(
  (s) => `${s.module}:${s.firstLine}-${s.lastLine}`,
).join(" + ")} after the pg bump`;

describe("PostgreSQLAdapter conn-param allowlist drift guard (trails)", () => {
  it("is pinned to the pg version its keyword extraction was verified against", () => {
    expect(require("pg/package.json").version, RECHECK_HINT).toBe(PINNED_PG_VERSION);
  });

  it("accepts every keyword the installed pg driver reads, and no extras", async () => {
    expect(sorted(allowlistKeywords()), RECHECK_HINT).toEqual(sorted(await deriveDriverKeywords()));
  });

  it("still derives the pg@9-deprecated Promise and connection keywords from pg@8", async () => {
    const driverKeys = await deriveDriverKeywords();
    const allowlist = allowlistKeywords();
    for (const key of PG9_DEPRECATED_KEYWORDS) {
      expect(
        allowlist.has(key) && !driverKeys.has(key),
        `pg no longer reads "${key}": drop it from VALID_CONN_PARAM_KEYS (removed in pg@9)`,
      ).toBe(false);
    }
  });
});
