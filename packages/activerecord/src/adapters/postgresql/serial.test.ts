/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/serial_test.rb
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

  describe("PostgresqlSerialTest", () => {
    it.skip("serial column", async () => {});
    it.skip("bigserial column", async () => {});
    it.skip("smallserial column", async () => {});
    it.skip("serial default", async () => {});
    it.skip("serial sequence name", async () => {});
    it.skip("serial schema dump", async () => {});
    it.skip("serial migration", async () => {});
    it.skip("serial primary key", async () => {});
    it.skip("bigserial primary key", async () => {});
    it.skip("serial not null", async () => {});
    it.skip("serial reset", async () => {});
    it.skip("serial custom sequence", async () => {});
    it.skip("not serial column", async () => {});
    it.skip("schema dump with not serial", async () => {});
    it.skip("not bigserial column", async () => {});
    it.skip("schema dump with not bigserial", async () => {});
    it.skip("serial columns", async () => {});
    it.skip("serial columns 2", async () => {});
    it.skip("schema dump with collided sequence name", async () => {});
    it.skip("schema dump with long table name", async () => {});
  });
});
