import { beforeEach } from "vitest";
import "../../../../lib/index.js";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  supportsJson,
} from "../../../../lib/adapters/abstract-mysql-adapter/test-helper.js";
import { fixtures } from "../../../../lib/test-helpers/use-fixtures.js";
import { jsonSharedTestCases } from "../../../../lib/cases/json-shared-test-cases.js";
import type { TableDefinition } from "../../../../lib/connection-adapters/abstract/schema-definitions.js";

const columnType = "json";

const describeJson = supportsJson ? describeIfMysqlAdapter : describeIfMysqlAdapter.skip;

describeJson("JSONTest", () => {
  fixtures({}, { useTransactionalTests: false });

  beforeEach(async () => {
    const connection = await leaseMysqlAdapter();
    // eslint-disable-next-line blazetrails/require-table-teardown
    await connection.createTable("json_data_type", {}, (t: TableDefinition) => {
      const column = t as unknown as Record<string, (name: string) => void>;
      column[columnType]("payload");
      column[columnType]("settings");
    });
  });

  jsonSharedTestCases({ columnType });
});
