import { describe } from "vitest";
import { adapterType } from "../test-adapter.js";

/**
 * The port of `current_adapter?(:Mysql2Adapter)` — the gate every
 * `ActiveRecord::AbstractMysqlTestCase` suite runs under. The suite rides the
 * ambient `Base.connection` on the mysql2 lane and skips everywhere else,
 * exactly as Rails does. Lives in `support/` rather than the
 * `adapters/abstract-mysql-adapter/` test-helper because suites outside that
 * tree gate on it too — a test file should never have to import glue from
 * another adapter's tree. Counterpart to `describeIfPg` / `describeIfSqlite`.
 *
 * Unlike those two this is a static `adapterType` check with no server probe
 * behind it, so importing it never opens a connection.
 */
export const describeIfMysqlAdapter =
  adapterType === "mysql" ? describe : (describe.skip as typeof describe);
