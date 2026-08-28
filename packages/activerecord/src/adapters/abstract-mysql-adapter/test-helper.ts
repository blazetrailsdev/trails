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
  supportsJson,
} from "../../support/mysql-server-version.js";

export const { arunit: ARUNIT_DATABASE, arunit2: ARUNIT2_DATABASE } = arunitDatabaseNames(
  mysqlSettings().database,
);

export { Mysql2Adapter };

export async function leaseMysqlAdapter(): Promise<Mysql2Adapter> {
  const adapter = (await Base.leaseConnection()) as unknown as Mysql2Adapter;
  await adapter.materializeTransactions();
  return adapter;
}
