import { Mysql2Adapter } from "../../connection-adapters/mysql2-adapter.js";
import { arunitDatabaseNames } from "../../support/arunit2-config.js";
import { mysqlSettings } from "../../support/config.js";
import { Base } from "../../base.js";

export { withDbWarningsAction } from "../../support/with-db-warnings-action.js";

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
 * MySQL server, so the names are derived from its `database` sub-setting (see
 * `arunit2-config`): `arunit` is the worker's primary database, `arunit2` its
 * sibling, exactly the two the probe's `pirates` and `courses` tables already
 * live in.
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
