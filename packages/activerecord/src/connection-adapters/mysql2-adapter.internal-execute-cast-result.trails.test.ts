import { afterEach, describe, expect, it, vi } from "vitest";
import { Result } from "../result.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import type { Mysql2RawResult } from "./mysql2/database-statements.js";

describe("Mysql2Adapter#internalExecute → castResult duplicate columns", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const POSITIONAL_ROW: [number, number] = [1, 2];
  const DUP_FIELDS = [
    { name: "a", type: 3 },
    { name: "a", type: 3 },
  ];

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

    const rawResult = (await adapter.internalExecute("SELECT 1 AS a, 2 AS a", "SQL", [], {
      materializeTransactions: false,
    })) as unknown as Mysql2RawResult;

    expect(rawResult.fields.map((f) => f.name)).toEqual(["a", "a"]);
    expect(rawResult.rows).toEqual([[1, 2]]);

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
