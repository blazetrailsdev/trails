import { describe, it, expect } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { MismatchedForeignKey } from "../errors.js";

// Trails-specific guards (no Rails counterpart): Rails'
// mismatched_foreign_key_details resolves the referenced column's type
// synchronously via column_for, so the exception message is always fully
// detailed. Trails defers that lookup to the async
// _enrichMismatchedForeignKey, which _translateAndEnrich must run AFTER the
// queryParser setQuery rebuild on the sql-less translation path
// (translateExceptionClass(e, null, null) inside withRawConnection) — the
// rebuild parses the FK names the enrichment needs. These run offline —
// constructing the adapter does not open a connection, and columns() is
// stubbed.
const FK_SQL =
  "ALTER TABLE `wheels` ADD CONSTRAINT `fk_wheels_vehicles` " +
  "FOREIGN KEY (`wheelable_id`) REFERENCES `vehicles` (`id`)";

function fkDriverError(): Error {
  const e = new Error("Cannot add foreign key constraint") as Error & { errno: number };
  e.errno = 1215; // ER_CANNOT_ADD_FOREIGN
  return e;
}

function makeAdapter(): Mysql2Adapter {
  const adapter = new Mysql2Adapter({ host: "localhost" });
  (adapter as unknown as { columns: unknown }).columns = async () => [
    { name: "id", sqlTypeMetadata: { sqlType: "bigint", type: "integer" } },
  ];
  return adapter;
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
    // The sql-less withRawConnection translation path builds the queryParser
    // variant; _translateAndEnrich must rebuild it with the statement sql and
    // THEN run enrichment so the referenced column type lands in the message.
    const sqlLess = adapter.translateExceptionClass(
      fkDriverError(),
      null,
      null,
    ) as MismatchedForeignKey;
    const enriched = await (
      adapter as unknown as {
        _translateAndEnrich(e: unknown, sql: string, binds: unknown[]): Promise<Error>;
      }
    )._translateAndEnrich(sqlLess, FK_SQL, []);
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
    // Mirrors the execute()/internalExecute() catch sites: a sql-less
    // MismatchedForeignKey thrown by the withRawConnection loop is re-run
    // through _translateAndEnrich via its raw driver cause plus the sql.
    const sqlLess = adapter.translateExceptionClass(
      fkDriverError(),
      null,
      null,
    ) as MismatchedForeignKey;
    const enriched = await (
      adapter as unknown as {
        _translateAndEnrich(e: unknown, sql: string, binds: unknown[]): Promise<Error>;
      }
    )._translateAndEnrich(sqlLess.cause ?? sqlLess, FK_SQL, []);
    expect(enriched).toBeInstanceOf(MismatchedForeignKey);
    expect(enriched.message).toContain("which has type `bigint`");
    await adapter.close();
  });
});
