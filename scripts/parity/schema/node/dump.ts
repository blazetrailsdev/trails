#!/usr/bin/env tsx
/**
 * Usage: tsx scripts/parity/schema/node/dump.ts <fixture-dir> <out.json>
 *
 * Must be run from the repo root so fixture paths and output paths resolve correctly.
 *
 * Applies <fixture-dir>/schema.sql to a fresh SQLite database, introspects
 * it using the trails ActiveRecord adapter, canonicalizes the result, and
 * writes canonical JSON to <out.json>.
 *
 * Validates against <fixture-dir>/expected.json (D6) and exits 2 on mismatch.
 */

import Database from "better-sqlite3";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Relative imports so tsx can resolve from source without a prior build.
// These paths are resolved relative to this file's location by the module system.
import { Base } from "../../../../packages/activerecord/src/base.js";
import {
  introspectTables,
  introspectColumns,
  introspectIndexes,
  introspectPrimaryKey,
} from "../../../../packages/activerecord/src/schema-introspection.js";
import { canonicalize } from "./canonicalize.js";
import type { NativeDump, NativeColumn, NativeIndex } from "./canonicalize.js";

interface ExpectedManifest {
  tables: string[];
  indexCount: number;
}

function usage(): never {
  process.stderr.write("Usage: tsx scripts/parity/schema/node/dump.ts <fixture-dir> <out.json>\n");
  process.exit(1);
}

function assertRepoRoot(): void {
  // Fixture arguments (argv[2], argv[3]) are resolved relative to CWD.
  // Fail fast with a clear message rather than a cryptic path error later.
  if (!existsSync("packages/activerecord/src/base.ts")) {
    process.stderr.write(
      "parity dump: must be run from the repo root (packages/activerecord/src/base.ts not found)\n",
    );
    process.exit(1);
  }
}

const FILTERED_TABLES = new Set(["schema_migrations", "ar_internal_metadata"]);

async function main(): Promise<void> {
  assertRepoRoot();
  const [fixtureDir, outPath] = process.argv.slice(2);
  if (!fixtureDir || !outPath) usage();

  const fixtureDirAbs = resolve(fixtureDir);
  const outPathAbs = resolve(outPath);

  const tmpDir = mkdtempSync(join(tmpdir(), "parity-node-"));
  const dbPath = join(tmpDir, "schema.db");

  try {
    // 1. Apply schema.sql to a fresh temp SQLite file via better-sqlite3
    const sql = readFileSync(join(fixtureDirAbs, "schema.sql"), "utf8");
    const db = new Database(dbPath);
    try {
      db.exec(sql);
    } finally {
      db.close();
    }

    // 2. Connect via trails adapter
    // Pass dbPath directly — adapterNameFromUrl recognises .db extension as sqlite.
    await Base.establishConnection(dbPath);
    const adapter = Base.adapter;

    // 3. Introspect tables, columns, indexes
    const tables = (await introspectTables(adapter)).filter((t) => !FILTERED_TABLES.has(t)).sort();

    const nativeDump: NativeDump = {};

    for (const tableName of tables) {
      const cols = await introspectColumns(adapter, tableName);
      const idxDefs = await introspectIndexes(adapter, tableName);

      const columns: NativeColumn[] = cols.map((col) => ({
        name: col.name,
        sqlType: col.sqlType ?? col.type ?? "",
        primaryKey: col.primaryKey,
        null: col.null,
        default: col.default !== null && col.default !== undefined ? String(col.default) : null,
        limit: col.limit,
        precision: col.precision,
        scale: col.scale,
      }));

      const indexes: NativeIndex[] = idxDefs.map((idx) => {
        if (!idx.name || idx.name.trim() === "") {
          throw new Error(
            `parity dump: index on "${tableName}" has no name (columns: ${JSON.stringify(idx.columns)})`,
          );
        }
        return {
          name: idx.name,
          columns: idx.columns,
          unique: idx.unique,
          where: idx.where ?? null,
        };
      });

      const primaryKeyColumns = await introspectPrimaryKey(adapter, tableName);
      nativeDump[tableName] = { columns, indexes, primaryKeyColumns };
    }

    // 4. Canonicalize
    const canonical = canonicalize(nativeDump);

    // 5. Validate against expected.json (D6)
    const expected = JSON.parse(
      readFileSync(join(fixtureDirAbs, "expected.json"), "utf8"),
    ) as ExpectedManifest;

    const actualTableNames = canonical.tables.map((t) => t.name).sort();
    const expectedTableNames = [...expected.tables].sort();
    if (JSON.stringify(actualTableNames) !== JSON.stringify(expectedTableNames)) {
      process.stderr.write(
        `parity dump: table mismatch\n  expected: ${JSON.stringify(expectedTableNames)}\n  actual:   ${JSON.stringify(actualTableNames)}\n`,
      );
      process.exitCode = 2;
      return;
    }

    const actualIndexCount = canonical.tables.reduce((n, t) => n + t.indexes.length, 0);
    if (actualIndexCount !== expected.indexCount) {
      process.stderr.write(
        `parity dump: index count mismatch\n  expected: ${expected.indexCount}\n  actual:   ${actualIndexCount}\n`,
      );
      process.exitCode = 2;
      return;
    }

    // 6. Write canonical JSON
    writeFileSync(outPathAbs, JSON.stringify(canonical, null, 2) + "\n");
    process.stdout.write(`parity dump (trails): wrote ${outPathAbs}\n`);
  } finally {
    // Explicitly close the adapter's DB handle before removing the temp file.
    // Base.removeConnection() only drops the pool reference; the adapter (and
    // its better-sqlite3 handle) may still be open, causing EBUSY on Windows.
    try {
      const a = Base.adapter as { close?: () => void };
      if (typeof a.close === "function") a.close();
    } catch {
      /* adapter unavailable or already closed */
    }
    try {
      Base.removeConnection();
    } catch {
      /* already removed or never opened */
    }
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      process.stderr.write(
        `parity dump: warning: failed to remove temp dir ${tmpDir}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`parity dump: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
