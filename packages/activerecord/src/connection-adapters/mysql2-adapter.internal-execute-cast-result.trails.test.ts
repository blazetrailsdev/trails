import { afterEach, describe, expect, it, vi } from "vitest";
import { Result } from "../result.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import type { Mysql2RawResult } from "./mysql2/database-statements.js";

// Regression guard (RFC 0056 mysql2-performquery-castresult-hashmode-collapses-
// duplicates): the `internalExecute` → `castResult` read path must preserve
// duplicate column names. The old hash-keyed `conn.query` collapsed
// `SELECT 1 AS a, 2 AS a` onto a single `a`; routing through the shared
// array-mode `performQuery` seam (rowsAsArray: true) keeps both positional
// columns, mirroring Rails' `configure_connection` setting
// `query_options[:as] = :array` (mysql2_adapter.rb:159) and `cast_result`
// building the Result from `result.fields` + positional rows
// (mysql2/database_statements.rb:111).
//
// Runs offline: the persistent `_connection` is preset to a fake whose
// array-mode `query` returns positional rows with two `a` fields, so no real
// socket is opened.
describe("Mysql2Adapter#internalExecute → castResult duplicate columns", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeAdapter(queryImpl: (...args: unknown[]) => Promise<unknown>): Mysql2Adapter {
    const adapter = new Mysql2Adapter({ host: "localhost", _fakeConnection: true } as never);
    const fakeConn = { query: queryImpl, end: () => Promise.resolve() };
    (adapter as unknown as { _connection: unknown })._connection = fakeConn;
    (adapter as unknown as { _verified: boolean })._verified = true;
    return adapter;
  }

  it("preserves duplicate column names via positional array-mode rows", async () => {
    // Array-mode driver result: [rows, fields]. Both fields are named `a`;
    // hash-keyed rows would have dropped the first onto the second.
    const adapter = makeAdapter(async () => [
      [[1, 2]],
      [
        { name: "a", type: 3 },
        { name: "a", type: 3 },
      ],
    ]);

    const rawResult = (await adapter.internalExecute("SELECT 1 AS a, 2 AS a", "SQL", {
      materializeTransactions: false,
    })) as unknown as Mysql2RawResult;

    // The raw read result keeps both positional columns and both cells.
    expect(rawResult.fields.map((f) => f.name)).toEqual(["a", "a"]);
    expect(rawResult.rows).toEqual([[1, 2]]);

    // cast_result builds a two-column Result from result.fields + positional rows.
    const result = (adapter as unknown as { castResult(r: Mysql2RawResult): Result }).castResult(
      rawResult,
    );
    expect(result).toBeInstanceOf(Result);
    expect(result.columns).toEqual(["a", "a"]);
    expect(result.rows[0]).toHaveLength(2);
    expect(result.rows[0][0]).toBe(1);
    expect(result.rows[0][1]).toBe(2);
  });
});
