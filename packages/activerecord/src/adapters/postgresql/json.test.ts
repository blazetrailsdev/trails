import { it, expect, beforeEach } from "vitest";
import "../../index.js";
import { sql as arelSql } from "@blazetrails/arel";
import { describeIfPostgresqlAdapter } from "../../support/describe-if-postgresql-adapter.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import { jsonSharedTestCases, JsonDataType as klass } from "../../cases/json-shared-test-cases.js";
import type { AbstractAdapter } from "../../connection-adapters/abstract-adapter.js";
import type { TableDefinition } from "../../connection-adapters/abstract/schema-definitions.js";

function insertStatementPerDatabase(values: string): string {
  return `insert into json_data_type (payload) VALUES ('${values}')`;
}

function postgresqlJsonSharedTestCases(columnType: string): void {
  let connection: AbstractAdapter;

  beforeEach(async () => {
    connection = await Base.leaseConnection();
    // eslint-disable-next-line blazetrails/require-table-teardown
    await connection.createTable("json_data_type", {}, (t: TableDefinition) => {
      const column = t as unknown as Record<
        string,
        (name: string, options?: Record<string, unknown>) => void
      >;
      column[columnType]("payload", { default: {} });
      column[columnType]("settings");
      column[columnType]("objects", { array: true });
    });
  });

  jsonSharedTestCases({ columnType, insertStatementPerDatabase });

  it("default", async () => {
    await connection.addColumn("json_data_type", "permissions", columnType, {
      default: { users: "read", posts: ["read", "write"] },
    });
    await klass.resetColumnInformation();
    await klass.loadSchema();

    expect(klass.columnDefaults["permissions"]).toEqual({
      users: "read",
      posts: ["read", "write"],
    });
    expect((new klass() as any).permissions).toEqual({ users: "read", posts: ["read", "write"] });
  });

  it("deserialize with array", async () => {
    const x = klass.new({ objects: [{ foo: "bar" }] }) as any;
    expect(x.objects).toEqual([{ foo: "bar" }]);
    await x.saveBang();
    expect(x.objects).toEqual([{ foo: "bar" }]);
    await x.reload();
    expect(x.objects).toEqual([{ foo: "bar" }]);
  });

  it("noname columns of different types", async () => {
    await connection.execute(insertStatementPerDatabase('{"a":{},"b":"b"}'));
    expect(await klass.pluck(arelSql("payload->'a', payload->>'b'"))).toEqual([[{}, "b"]]);
  });
}

describeIfPostgresqlAdapter("PostgresqlJSONTest", () => {
  fixtures([]);
  postgresqlJsonSharedTestCases("json");
});

describeIfPostgresqlAdapter("PostgresqlJSONBTest", () => {
  fixtures([]);
  postgresqlJsonSharedTestCases("jsonb");
});
