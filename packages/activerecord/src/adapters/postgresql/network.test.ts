/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/network_test.rb
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

  describe("PostgresqlNetworkTest", () => {
    it.skip("inet column", async () => {});
    it.skip("inet type cast", async () => {});
    it.skip("inet write", async () => {});
    it.skip("inet where", async () => {});
    it.skip("cidr column", async () => {});
    it.skip("cidr type cast", async () => {});
    it.skip("macaddr column", async () => {});
    it.skip("macaddr type cast", async () => {});
    it.skip("network types", async () => {});
    it.skip("invalid network address", async () => {});
    it.skip("cidr change prefix", async () => {});
    it.skip("mac address change case does not mark dirty", async () => {});
  });
});
