import { describe, expect, it } from "vitest";
import { SQLite3 } from "../lib/index.js";
import type { EngineDatabase } from "../lib/database.js";
import type { EngineStatement } from "../lib/statement.js";

function fakeDatabase(rows: unknown[][], names: string[], async: boolean) {
  const binds: [string | number, unknown][] = [];
  const wrap = <T>(v: T): T | Promise<T> => (async ? Promise.resolve(v) : v);
  let i = 0;
  let done = false;
  let closed = false;
  const engine: EngineStatement = {
    close: () => {
      closed = true;
      return wrap(undefined);
    },
    isClosed: () => closed,
    bindParam: (key, value) => {
      binds.push([key, value]);
      return wrap(undefined);
    },
    resetBang: () => {
      i = 0;
      done = false;
      return wrap(undefined);
    },
    step: () => {
      const row = rows[i++] ?? null;
      if (row == null) done = true;
      return wrap(row);
    },
    isDone: () => done,
    columnCount: () => wrap(names.length),
    columnName: (index) => wrap(names[index] ?? null),
    columnDecltype: () => wrap(null),
    setReadBigInts: () => undefined,
  };
  const engineDb: EngineDatabase = {
    isClosed: () => false,
    isDiscarded: () => false,
    errcode: () => null,
    errmsg: (e) => String(e),
    prepare: () => [engine, ""],
    execBatch: () => [],
    changes: () => 0,
    close: () => undefined,
    disableQuirkMode: () => undefined,
    busyHandler: () => undefined,
    loadExtensionInternal: () => undefined,
    enableLoadExtension: () => undefined,
  };
  const db = new SQLite3.Database(":memory:", { engine: () => engineDb });
  return { db, binds, engineDb };
}

describe("SQLite3::Statement over a fake engine", () => {
  it("bindParams numbers positionals from 1 and binds hash keys by name", async () => {
    const { db, binds } = fakeDatabase([], [], false);
    const stmt = await SQLite3.Statement.new(db, "select ?, :b, ?");
    await stmt.bindParams([1, [{ b: 2 }]], 3);
    expect(binds).toEqual([
      [1, 1],
      ["b", 2],
      [2, 3],
    ]);
  });

  it("columns maps columnName over columnCount, sync and async", async () => {
    expect(
      await (await SQLite3.Statement.new(fakeDatabase([], ["a", "b"], false).db, "x")).columns(),
    ).toEqual(["a", "b"]);
    const stmt = await SQLite3.Statement.new(fakeDatabase([], ["a", "b"], true).db, "x");
    const columns = stmt.columns();
    expect(columns).toBeInstanceOf(Promise);
    expect(await columns).toEqual(["a", "b"]);
  });

  it("toA collects each row, sync and async", async () => {
    const rows = [[1], [2]];
    expect(
      await (await SQLite3.Statement.new(fakeDatabase(rows, [], false).db, "x")).toA(),
    ).toEqual(rows);
    expect(await (await SQLite3.Statement.new(fakeDatabase(rows, [], true).db, "x")).toA()).toEqual(
      rows,
    );
  });

  it("done? survives close, and a discarded database refuses step", async () => {
    const fake = fakeDatabase([], [], false);
    let discarded = false;
    fake.engineDb.isDiscarded = () => discarded;
    const stmt = await SQLite3.Statement.new(fake.db, "x");
    await stmt.step();
    await stmt.close();
    expect(stmt.isDone()).toBe(true);
    const live = await SQLite3.Statement.new(fake.db, "x");
    discarded = true;
    expect(() => live.step()).toThrow(
      "cannot use a statement associated with a discarded database",
    );
  });

  it("bindParams binds in order, awaiting each async bind", async () => {
    const { db, binds } = fakeDatabase([], [], true);
    const stmt = await SQLite3.Statement.new(db, "x");
    await stmt.bindParams(1, 2, 3);
    expect(binds.map(([k]) => k)).toEqual([1, 2, 3]);
  });

  it("a closed statement raises from every C primitive but closed? and done?", async () => {
    const stmt = await SQLite3.Statement.new(fakeDatabase([], [], false).db, "x");
    await stmt.close();
    expect(stmt.isClosed()).toBe(true);
    for (const call of [
      () => stmt.step(),
      () => stmt.resetBang(),
      () => stmt.bindParam(1, 1),
      () => stmt.columnCount(),
      () => stmt.columnName(0),
      () => stmt.mustBeOpenBang(),
    ]) {
      expect(call).toThrow("cannot use a closed statement");
    }
  });
});
