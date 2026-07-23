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
  (adapter as unknown as { columns: unknown }).columns = async () => [
    { name: "id", sqlTypeMetadata: { sqlType: "bigint", type: "integer" } },
  ];
  return adapter;
}

function translateAndEnrich(adapter: Mysql2Adapter, e: unknown, sql: string): Promise<Error> {
  return (
    adapter as unknown as {
      _translateAndEnrich(e: unknown, sql: string, binds: unknown[]): Promise<Error>;
    }
  )._translateAndEnrich(e, sql, []);
}

describe("Mysql2Adapter#_translateAndEnrich (queryParser rebuild ordering)", () => {
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

  it("re-enriches a sql-less MismatchedForeignKey after the setQuery rebuild", async () => {
    const adapter = makeAdapter();
    const sqlLess = adapter.translateExceptionClass(
      fkDriverError(),
      null,
      null,
    ) as MismatchedForeignKey;
    const enriched = await translateAndEnrich(adapter, sqlLess, FK_SQL);
    expect(enriched).toBeInstanceOf(MismatchedForeignKey);
    expect(enriched.message).toContain(
      "Column `wheelable_id` on table `wheels` does not match column `id` on `vehicles`, " +
        "which has type `bigint`.",
    );
    expect(enriched.message).toContain("`t.bigint :wheelable_id`");
    expect((enriched as MismatchedForeignKey).sql).toBe(FK_SQL);
    await adapter.close();
  });

  it("re-translates from the driver cause when the catch site unwraps it", async () => {
    const adapter = makeAdapter();
    const sqlLess = adapter.translateExceptionClass(
      fkDriverError(),
      null,
      null,
    ) as MismatchedForeignKey;
    const enriched = await translateAndEnrich(adapter, sqlLess.cause ?? sqlLess, FK_SQL);
    expect(enriched).toBeInstanceOf(MismatchedForeignKey);
    expect(enriched.message).toContain("which has type `bigint`");
    await adapter.close();
  });
});
