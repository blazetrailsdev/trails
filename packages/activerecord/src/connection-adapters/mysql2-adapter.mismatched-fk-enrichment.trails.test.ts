import { describe, it, expect } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { MismatchedForeignKey } from "../errors.js";

const FK_SQL =
  "ALTER TABLE `wheels` ADD CONSTRAINT `fk_wheels_vehicles` " +
  "FOREIGN KEY (`wheelable_id`) REFERENCES `vehicles` (`id`)";

function fkDriverError(): Error {
  const e = new Error("Cannot add foreign key constraint") as Error & { errno: number };
  e.errno = 1215;
  return e;
}

function makeAdapter(): Mysql2Adapter {
  const adapter = new Mysql2Adapter({ host: "localhost" });
  (adapter as unknown as { columnFor: unknown }).columnFor = async () => ({
    name: "id",
    sqlTypeMetadata: { sqlType: "bigint", type: "integer" },
  });
  return adapter;
}

function enrich(adapter: Mysql2Adapter, err: unknown): Promise<unknown> {
  return (
    adapter as unknown as { _enrichMismatchedForeignKey(err: unknown): Promise<unknown> }
  )._enrichMismatchedForeignKey(err);
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
    const rebuilt = sqlLess.setQuery(FK_SQL, []) as MismatchedForeignKey;
    expect(rebuilt).toBeInstanceOf(MismatchedForeignKey);
    expect(rebuilt.fkDetails).toMatchObject({
      table: "wheels",
      foreignKey: "wheelable_id",
      targetTable: "vehicles",
      primaryKey: "id",
    });
    expect(rebuilt.sql).toBe(FK_SQL);
    await adapter.close();
  });

  it("translating with the sql present carries the primary key column type into the message", async () => {
    const adapter = makeAdapter();
    const translated = adapter.translateExceptionClass(fkDriverError(), FK_SQL, []);
    const enriched = (await enrich(adapter, translated)) as MismatchedForeignKey;

    expect(enriched).toBeInstanceOf(MismatchedForeignKey);
    expect(enriched.message).toContain(
      "Column `wheelable_id` on table `wheels` does not match column `id` on `vehicles`, " +
        "which has type `bigint`.",
    );
    expect(enriched.message).toContain("`t.bigint :wheelable_id`");
    await adapter.close();
  });

  it("passes a non-MismatchedForeignKey error through untouched", async () => {
    const adapter = makeAdapter();
    const err = new Error("boom");
    expect(await enrich(adapter, err)).toBe(err);
    await adapter.close();
  });
});
