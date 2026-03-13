/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/rename_table_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pg from "pg";
import { PostgresAdapter } from "../postgres-adapter.js";

const PG_TEST_URL = process.env.PG_TEST_URL ?? "postgres://localhost:5432/rails_js_test";

let pgAvailable = false;

async function checkPg(): Promise<boolean> {
  try {
    const client = new pg.Client({ connectionString: PG_TEST_URL });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch {
    return false;
  }
}

pgAvailable = await checkPg();
const describeIfPg = pgAvailable ? describe : describe.skip;

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlRenameTableTest", () => {
    it.skip("rename table", async () => {});
    it.skip("rename table with index", async () => {});
    it.skip("rename table with sequence", async () => {});
    it.skip("rename table preserves data", async () => {});
    it.skip("renaming a table with uuid primary key and uuid_generate_v4() default also renames the primary key index", async () => {});
    it.skip("renaming a table with uuid primary key and gen_random_uuid() default also renames the primary key index", async () => {});
    it.skip("renaming a table also renames the primary key sequence", () => {});
    it.skip("renaming a table also renames the primary key index", () => {});
  });
});
