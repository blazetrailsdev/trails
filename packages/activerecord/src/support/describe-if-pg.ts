import { describe } from "vitest";
import pg from "pg";
import { postgresUrl } from "./config.js";

export const PG_TEST_URL = postgresUrl();

async function checkPg(): Promise<{
  available: boolean;
  serverVersionNum: number;
  hasHintPlan: boolean;
}> {
  const client = new pg.Client({ connectionString: PG_TEST_URL });
  try {
    await client.connect();
    const res = await client.query<{ v: string }>(
      "SELECT current_setting('server_version_num') AS v",
    );
    const ext = await client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM pg_available_extensions WHERE name = 'pg_hint_plan'",
    );
    return {
      available: true,
      serverVersionNum: Number(res.rows[0]?.v ?? 0),
      hasHintPlan: Number(ext.rows[0]?.count ?? 0) > 0,
    };
  } catch {
    return { available: false, serverVersionNum: 0, hasHintPlan: false };
  } finally {
    await client.end().catch(() => {});
  }
}

const probe = await checkPg();

export const pgAvailable = probe.available;
export const pgServerVersion = probe.serverVersionNum;
export const pgHasHintPlan = probe.hasHintPlan;

export const describeIfPg = pgAvailable ? describe : (describe.skip as typeof describe);
