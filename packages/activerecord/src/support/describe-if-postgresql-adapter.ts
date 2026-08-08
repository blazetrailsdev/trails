import { describe } from "vitest";
import { adapterType } from "../test-adapter.js";

/**
 * The port of `current_adapter?(:PostgreSQLAdapter)` — the gate every
 * `ActiveRecord::PostgreSQLTestCase` suite runs under. The suite rides the
 * ambient `Base.connection` on the postgresql lane and skips everywhere else,
 * exactly as Rails does. Counterpart to {@link describeIfMysqlAdapter}.
 *
 * Distinct from `describeIfPg`, which probes for a *reachable* PostgreSQL
 * server and so runs on lanes whose `Base.connection` is not PostgreSQL; a
 * suite that leases the ambient connection needs the adapter gate, not the
 * server probe.
 */
export const describeIfPostgresqlAdapter =
  adapterType === "postgres" ? describe : (describe.skip as typeof describe);
