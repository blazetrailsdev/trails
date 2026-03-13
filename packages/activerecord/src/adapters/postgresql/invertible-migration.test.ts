/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/invertible_migration_test.rb
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

  describe("PostgresqlInvertibleMigrationTest", () => {
    it.skip("up", async () => {});
    it.skip("down", async () => {});
    it.skip("change", async () => {});
    it.skip("revert", async () => {});
    it.skip("revert whole migration", async () => {});
    it.skip("migrate and revert", async () => {});
    it.skip("migrate revert add index with expression", () => {});
    it.skip("migrate revert create enum", () => {});
    it.skip("migrate revert drop enum", () => {});
    it.skip("migrate revert rename enum value", () => {});
    it.skip("migrate revert add and validate check constraint", () => {});
    it.skip("migrate revert add and validate foreign key", () => {});
  });
});
