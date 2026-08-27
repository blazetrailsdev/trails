/**
 * End-to-end coverage for the PG/MySQL bulk reverse-FK catalog query behind
 * `bulkInboundFkHost`. `canonical-schema.trails.test.ts` pins the seam and the
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
    // The canonical schema already lays `lessons_students -> students`
    // (schema.rb:726); the rebuild must drop only the `authors` edge added here.
    await adapter.addForeignKey("lessons_students", "authors", { column: "lesson_id" });
    try {
      expect(await lessonsStudentsForeignKeyTargets()).toEqual(["authors", "students"]);

      await rebuildCanonicalTables(adapter, ["authors"]);
      expect(await lessonsStudentsForeignKeyTargets()).toEqual(["students"]);
    } finally {
      await restoreLessonsStudentsForeignKeys();
    }
  });

  it("leaves a same-named table outside the resolution scope alone", async () => {
    const decoy = pg ? "decoy" : `${await currentDatabase()}_decoy`;
    const id = pg ? "id bigserial PRIMARY KEY" : "id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY";
    const dropDecoy = pg
      ? `DROP SCHEMA IF EXISTS ${decoy} CASCADE`
      : `DROP DATABASE IF EXISTS ${decoy}`;
    const searchPath = pg ? await currentSearchPath() : "";

    await adapter.executeMutation(dropDecoy);
    await adapter.executeMutation(`${pg ? "CREATE SCHEMA" : "CREATE DATABASE"} ${decoy}`);
    try {
      await adapter.executeMutation(`CREATE TABLE ${decoy}.authors (${id})`);
      await adapter.executeMutation(
        `CREATE TABLE ${decoy}.author_favorites (${id}, author_id bigint,
           CONSTRAINT fk_decoy_author FOREIGN KEY (author_id) REFERENCES ${decoy}.authors (id))`,
      );
      if (pg) await adapter.executeMutation(`SET search_path = ${searchPath}, ${decoy}`);

      await rebuildCanonicalTables(adapter, ["authors"]);

      expect(await decoyForeignKeyNames(decoy)).toEqual(["fk_decoy_author"]);
      expect(await adapter.columns("authors")).not.toHaveLength(0);
    } finally {
      if (pg) await adapter.executeMutation(`SET search_path = ${searchPath}`);
      await adapter.executeMutation(dropDecoy);
    }
  });
});

async function lessonsStudentsForeignKeyTargets(): Promise<string[]> {
  const fks = await adapter.foreignKeys("lessons_students");
  return fks.map((fk) => fk.toTable).sort();
}

/** Strip every FK off the join table and put the canonical one back. */
async function restoreLessonsStudentsForeignKeys(): Promise<void> {
  for (const fk of await adapter.foreignKeys("lessons_students")) {
    await adapter.removeForeignKey("lessons_students", { name: fk.name });
  }
  await adapter.addForeignKey("lessons_students", "students", {
    column: "student_id",
    onDelete: "cascade",
    deferrable: "immediate",
  });
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
