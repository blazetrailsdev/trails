import { describe, it, expect } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { MismatchedForeignKey } from "../errors.js";

const FK_SQL =
  "ALTER TABLE `wheels` ADD CONSTRAINT `fk_wheels_vehicles` " +
  "FOREIGN KEY (`wheelable_id`) REFERENCES `vehicles` (`id`)";

const BIGINT_ID = { name: "id", sqlType: "bigint", type: "integer", isBigint: () => true };

function fkDriverError(): Error {
  const e = new Error("Cannot add foreign key constraint") as Error & { errno: number };
  e.errno = 1215;
  return e;
}

function makeAdapter(): Mysql2Adapter {
  const adapter = new Mysql2Adapter({ host: "localhost" });
  (adapter as unknown as { columnFor: unknown }).columnFor = async () => BIGINT_ID;
  return adapter;
}

describe("Mysql2Adapter mismatched foreign key translation", () => {
  it("sql-less translation yields a MismatchedForeignKey with the generic fallback message", async () => {
    const adapter = makeAdapter();
    const translated = adapter.translateExceptionClass(fkDriverError(), null, null);
    expect(translated).toBeInstanceOf(MismatchedForeignKey);
    expect((translated as MismatchedForeignKey).message).toContain(
      "There is a mismatch between the foreign key and primary key column types",
    );
    expect((translated as MismatchedForeignKey).fkDetails.targetTable).toBeUndefined();
    await adapter.close();
  });

  it("a sql-less MismatchedForeignKey picks up its details from the queryParser lambda", async () => {
    const adapter = makeAdapter();
    const sqlLess = adapter.translateExceptionClass(
      fkDriverError(),
      null,
      null,
    ) as MismatchedForeignKey;
    const rebuilt = (await sqlLess.setQuery(FK_SQL, [])) as MismatchedForeignKey;
    expect(rebuilt).toBeInstanceOf(MismatchedForeignKey);
    expect(rebuilt.fkDetails).toMatchObject({
      table: "wheels",
      foreignKey: "wheelable_id",
      targetTable: "vehicles",
      primaryKey: "id",
      primaryKeyColumn: BIGINT_ID,
    });
    expect(rebuilt.sql).toBe(FK_SQL);
    expect(rebuilt.stack).toBe(sqlLess.stack);
    await adapter.close();
  });

  it("translating with the sql present carries the primary key column type into the message", async () => {
    const adapter = makeAdapter();
    const driverError = fkDriverError();
    const translated = (await adapter.translateExceptionClass(
      driverError,
      FK_SQL,
      [],
    )) as MismatchedForeignKey;

    expect(translated).toBeInstanceOf(MismatchedForeignKey);
    expect(translated.message).toContain(
      "Column `wheelable_id` on table `wheels` does not match column `id` on `vehicles`, " +
        "which has type `bigint`.",
    );
    expect(translated.message).toContain("`t.bigint :wheelable_id`");
    expect(translated.stack).toBe(driverError.stack);
    expect(translated.cause).toBe(driverError);
    await adapter.close();
  });

  it("log's rescue resolves the column lookup through set_query", async () => {
    const adapter = makeAdapter();
    const sqlLess = adapter.translateExceptionClass(fkDriverError(), null, null);
    const raised = await adapter
      .log(FK_SQL, "SQL", [], [], false, async () => {
        throw sqlLess;
      })
      .catch((e: unknown) => e);

    expect(raised).toBeInstanceOf(MismatchedForeignKey);
    expect((raised as MismatchedForeignKey).message).toContain("which has type `bigint`.");
    expect((raised as MismatchedForeignKey).message).toContain(
      "\nOriginal message: Error: Cannot add foreign key constraint",
    );
    expect((raised as MismatchedForeignKey).stack).toBe((sqlLess as Error).stack);
    await adapter.close();
  });
});
