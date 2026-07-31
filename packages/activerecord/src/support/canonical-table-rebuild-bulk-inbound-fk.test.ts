/**
 * End-to-end coverage for the PG/MySQL bulk reverse-FK catalog query behind
 * `bulkInboundFkHost`. `canonical-schema.test.ts` pins the seam and the
 * row -> blocker mapping against a fake adapter, and its live rebuild test
 * builds its own SQLite adapter — so the SQL itself only runs here.
 *
 * A query that *throws* would already surface on every PG/MySQL run; the two
 * cases below cover the two silent failures: returning no row (the blocker goes
 * unreported and the DROP fails) and returning a row for a same-named table
 * outside the resolution scope (a live constraint elsewhere gets dropped).
 *
 * DDL-heavy and deliberately not on transactional fixtures.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { rebuildCanonicalTables } from "./canonical-table-rebuild.js";
import { activeLane } from "./connection.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

const lane = activeLane();

let adapter: DatabaseAdapter;
let pg: boolean;
beforeAll(() => {
  adapter = Base.adapter;
  pg = adapter.adapterName === "postgres";
});

describe.skipIf(lane === "sqlite")("bulkInboundFkHost (live catalog)", () => {
  it("drops a foreign key reaching in from a table it is not rebuilding", async () => {
    // `lessons_students` is outside the rebuild set and `authors` declares no FK
    // of its own, so nothing about the rebuilt set hints the constraint exists:
    // only the bulk reverse lookup can find it, and PG/MySQL refuse the DROP
    // while it is live.
    // Canonical `lessons_students` declares no foreign key, so anything live on
    // it is debris from an attempt that died before its own cleanup — clear it
    // up front too, or `addForeignKey` throws on the duplicate constraint name
    // and wedges this worker's DB for good.
    await clearLessonsStudentsForeignKeys();
    try {
      await adapter.addForeignKey("lessons_students", "authors", { column: "lesson_id" });
      expect(await adapter.foreignKeys("lessons_students")).toHaveLength(1);

      await rebuildCanonicalTables(adapter, ["authors"]);
      expect(await adapter.foreignKeys("lessons_students")).toEqual([]);
    } finally {
      await clearLessonsStudentsForeignKeys();
    }
  });

  it("leaves a same-named table outside the resolution scope alone", async () => {
    // The regression this guards: matching the referenced table by *name*
    // (`relname IN (...)`, or an unscoped information_schema lookup) reports a
    // constraint on some other `authors` as a blocker, and the rebuild then
    // drops a live foreign key that has nothing to do with the canonical DB.
    // PG schemas are database-local, but every MySQL worker shares one server —
    // so the decoy database is named after this worker's own database.
    const decoy = pg ? "decoy" : `${await currentDatabase()}_decoy`;
    const id = pg ? "id bigserial PRIMARY KEY" : "id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY";
    const dropDecoy = pg
      ? `DROP SCHEMA IF EXISTS ${decoy} CASCADE`
      : `DROP DATABASE IF EXISTS ${decoy}`;
    const searchPath = pg ? await currentSearchPath() : "";

    await adapter.executeMutation(dropDecoy);
    await adapter.executeMutation(`${pg ? "CREATE SCHEMA" : "CREATE DATABASE"} ${decoy}`);
    try {
      // Both decoy tables carry canonical names on purpose: `fkSafeDropPlan`
      // drops a reported blocker whose referencing table is not live, so a decoy
      // named anything else would be filtered out before the removal and a
      // name-based catalog query would still look correct here.
      await adapter.executeMutation(`CREATE TABLE ${decoy}.authors (${id})`);
      await adapter.executeMutation(
        `CREATE TABLE ${decoy}.author_favorites (${id}, author_id bigint,
           CONSTRAINT fk_decoy_author FOREIGN KEY (author_id) REFERENCES ${decoy}.authors (id))`,
      );
      // On PG the decoy has to be *on the search path* to be a candidate at all;
      // the real path stays in front so plain `authors` still resolves to the
      // canonical table. MySQL has no search path — another database is scope
      // enough.
      if (pg) await adapter.executeMutation(`SET search_path = ${searchPath}, ${decoy}`);

      await rebuildCanonicalTables(adapter, ["authors"]);

      expect(await decoyForeignKeyNames(decoy)).toEqual(["fk_decoy_author"]);
      // The rebuild itself has to have gone through, or the assertion above
      // would pass on a helper that did nothing at all.
      expect(await adapter.columns("authors")).not.toHaveLength(0);
    } finally {
      if (pg) await adapter.executeMutation(`SET search_path = ${searchPath}`);
      await adapter.executeMutation(dropDecoy);
    }
  });
});

async function clearLessonsStudentsForeignKeys(): Promise<void> {
  for (const fk of await adapter.foreignKeys("lessons_students")) {
    await adapter.removeForeignKey("lessons_students", { name: fk.name });
  }
}

async function currentDatabase(): Promise<string> {
  const rows = (await adapter.execute("SELECT DATABASE() AS db")) as Array<{ db: string }>;
  return rows[0].db;
}

async function currentSearchPath(): Promise<string> {
  const rows = (await adapter.execute("SELECT current_setting('search_path') AS path")) as Array<{
    path: string;
  }>;
  return rows[0].path;
}

async function decoyForeignKeyNames(decoy: string): Promise<string[]> {
  const sql = pg
    ? `SELECT c.conname AS name FROM pg_constraint c
         JOIN pg_class t ON c.conrelid = t.oid
         JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = '${decoy}' AND c.contype = 'f'`
    : `SELECT DISTINCT constraint_name AS name FROM information_schema.key_column_usage
        WHERE table_schema = '${decoy}' AND referenced_column_name IS NOT NULL`;
  return ((await adapter.execute(sql)) as Array<{ name: string }>).map((r) => r.name);
}
