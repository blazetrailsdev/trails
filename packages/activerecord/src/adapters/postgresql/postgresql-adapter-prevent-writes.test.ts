/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/postgresql_adapter_prevent_writes_test.rb
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

  describe("PostgreSQLAdapterPreventWritesTest", () => {
    it.skip("prevent writes insert", async () => {});
    it.skip("prevent writes update", async () => {});
    it.skip("prevent writes delete", async () => {});
    it.skip("prevent writes create table", async () => {});
    it.skip("prevent writes drop table", async () => {});
    it.skip("prevent writes allows select", async () => {});
    it.skip("prevent writes allows explain", async () => {});
    it.skip("prevent writes toggle", async () => {});
    it.skip("doesnt error when a read query with cursors is called while preventing writes", async () => {});
  });
});
