import { it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { describeIfPostgresqlAdapter } from "../../support/describe-if-postgresql-adapter.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import { JsonDataType as klass } from "../../cases/json-shared-test-cases.js";
import type { AbstractAdapter } from "../../connection-adapters/abstract-adapter.js";
import type { TableDefinition } from "../../connection-adapters/abstract/schema-definitions.js";

describeIfPostgresqlAdapter("PostgresqlJSONBBeforeTypeCastTest", () => {
  fixtures([]);

  let connection: AbstractAdapter;

  beforeEach(async () => {
    connection = await Base.leaseConnection();
    await connection.createTable("json_data_type", {}, (t: TableDefinition) => {
      (t as unknown as Record<string, (name: string) => void>)["jsonb"]("payload");
    });
    await klass.resetColumnInformation();
    await klass.loadSchema();
  });

  afterEach(async () => {
    await connection.dropTable("json_data_type", { ifExists: true });
    await klass.resetColumnInformation();
  });

  it("a jsonb attribute reaches changed_in_place? as its before_type_cast string", async () => {
    await klass.create({ payload: { a: 1 } } as never);
    const record = (await klass.first()) as unknown as {
      attributeBeforeTypeCast(attrName: string): unknown;
      payload: Record<string, unknown>;
      hasChangesToSave: boolean;
    };

    expect(typeof record.attributeBeforeTypeCast("payload")).toBe("string");

    expect(record.hasChangesToSave).toBe(false);
    record.payload["a"] = 2;
    expect(record.hasChangesToSave).toBe(true);
  });
});
