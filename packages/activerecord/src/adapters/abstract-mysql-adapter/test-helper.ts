import { Mysql2Adapter } from "../../connection-adapters/mysql2-adapter.js";
import { arunitDatabaseNames } from "../../support/arunit2-config.js";
import { mysqlSettings } from "../../support/config.js";
import { Base } from "../../base.js";

// `dbWarningsAction` is a single global setting on the base adapter, so the
// shared helper toggles it for every adapter (including MySQL). Re-exported
// here so MySQL adapter tests can keep importing it from this module.
export { withDbWarningsAction } from "../../support/with-db-warnings-action.js";

// The adapter gate and the live-server version probe live under `support/`
// alongside `describe-if-pg` / `describe-if-sqlite`, so suites outside this
// tree never import gate glue from an adapter's test-helper. Re-exported for
// the MySQL suites that already sit here.
export { describeIfMysqlAdapter } from "../../support/describe-if-mysql-adapter.js";
export {
  MYSQL_TEST_URL,
  isMariaDb,
  mysqlVersion,
  supportsDefaultExpression,
  supportsExpressionIndex,
  supportsOptimizerHints,
  supportsRenameIndex,
} from "../../support/mysql-server-version.js";

/**
 * ARTest models the AR suite as two databases — `arunit` (primary) and
 * `arunit2` — and reads both names from `ARTest.test_configuration_hashes`.
 * Rails' cross-database-select probe references them by those configured
 * names rather than inventing throwaway databases. trails provisions a single
 * MySQL server, so the names are derived from its `database` sub-setting
 * by suffixing the primary database (see `arunit2-config`). They are dedicated
 * to the cross-database probe — kept off the shared primary, whose canonical
 * tables parallel test workers create and drop — but config-derived, not
 * invented per call.
 */
export const { arunit: ARUNIT_DATABASE, arunit2: ARUNIT2_DATABASE } = arunitDatabaseNames(
  mysqlSettings().database,
);

export { Mysql2Adapter };

/**
 * Port of these suites' `setup` line
 * `@connection = ActiveRecord::Base.lease_connection`: leases the ambient pool
 * connection, so the leased connection's config plumbing — `configureConnection`, pool
 * settings, `preparedStatements` — is what the test exercises.
 */
export async function leaseMysqlAdapter(): Promise<Mysql2Adapter> {
  const adapter = (await Base.leaseConnection()) as unknown as Mysql2Adapter;
  await adapter.materializeTransactions();
  return adapter;
}
