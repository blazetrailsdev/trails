import { describe } from "vitest";
import pg from "pg";
import { PostgreSQLAdapter } from "../postgresql-adapter.js";

export const PG_TEST_URL = process.env.PG_TEST_URL ?? "postgres://localhost:5432/rails_js_test";

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

export const describeIfPg = pgAvailable ? describe : (describe.skip as typeof describe);
export { PostgreSQLAdapter };
