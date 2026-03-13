/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/referential_integrity_test.rb
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

  describe("PostgresqlReferentialIntegrityTest", () => {
    it.skip("disable referential integrity", async () => {});
    it.skip("enable referential integrity", async () => {});
    it.skip("disable and enable referential integrity", async () => {});
    it.skip("foreign key violation without disable", async () => {});
    it.skip("foreign key violation with disable", async () => {});
    it.skip("truncate with cascade", async () => {});
    it.skip("should reraise invalid foreign key exception and show warning", () => {});
    it.skip("does not print warning if no invalid foreign key exception was raised", () => {});
    it.skip("does not break transactions", () => {});
    it.skip("does not break nested transactions", () => {});
    it.skip("only catch active record errors others bubble up", () => {});
    it.skip("all foreign keys valid having foreign keys in multiple schemas", () => {});
  });
});
