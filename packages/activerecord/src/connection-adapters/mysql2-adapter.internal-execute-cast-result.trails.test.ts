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
// Runs offline: the persistent `_connection` is preset to a driver-faithful
// fake, so no real socket is opened. The fake mirrors node-mysql2's contract —
// it honours `rowsAsArray` (positional rows when set, hash-keyed rows when not),
// so that if `internalExecute` ever regressed to the hash-keyed `conn.query`
// path the duplicate `a` would collapse and this test would fail. Always
// returning array rows regardless of options would make the guard vacuous.
describe("Mysql2Adapter#internalExecute → castResult duplicate columns", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Two positional cells [1, 2] under two identically-named `a` field packets.
  const POSITIONAL_ROW: [number, number] = [1, 2];
  const DUP_FIELDS = [
    { name: "a", type: 3 },
    { name: "a", type: 3 },
  ];

  // node-mysql2-faithful `query`: array-mode (`rowsAsArray: true`) yields
  // positional rows; anything else yields hash-keyed rows, which collapse the
  // second `a` onto the first exactly as the driver would.
  function driverQuery(...args: unknown[]): Promise<[unknown, typeof DUP_FIELDS]> {
    const opts = args[0];
    const asArray =
      typeof opts === "object" && opts !== null && (opts as { rowsAsArray?: boolean }).rowsAsArray;
    if (asArray) {
      return Promise.resolve([[POSITIONAL_ROW], DUP_FIELDS]);
    }
    const hashRow: Record<string, number> = {};
    for (let i = 0; i < DUP_FIELDS.length; i++) hashRow[DUP_FIELDS[i].name] = POSITIONAL_ROW[i];
    return Promise.resolve([[hashRow], DUP_FIELDS]);
  }

  function makeAdapter(): Mysql2Adapter {
    const adapter = new Mysql2Adapter({ host: "localhost", _fakeConnection: true } as never);
    const fakeConn = { query: driverQuery, end: () => Promise.resolve() };
    (adapter as unknown as { _connection: unknown })._connection = fakeConn;
    (adapter as unknown as { _verified: boolean })._verified = true;
    return adapter;
  }

  it("preserves duplicate column names via positional array-mode rows", async () => {
    const adapter = makeAdapter();

    const rawResult = (await adapter.internalExecute("SELECT 1 AS a, 2 AS a", "SQL", {
      materializeTransactions: false,
    })) as unknown as Mysql2RawResult;

    // internalExecute must request array-mode rows: the raw read result keeps
    // both positional columns and both cells (hash-keyed rows would have
    // dropped the first `a` onto the second, leaving a single column).
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
