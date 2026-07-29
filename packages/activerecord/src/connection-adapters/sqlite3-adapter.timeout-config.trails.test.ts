import { describe, it, expect, afterEach, vi } from "vitest";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { deprecator } from "../deprecator.js";

describe("SQLite3Adapter timeout config coercion", () => {
  let adapter: AbstractSQLite3Adapter | undefined;

  afterEach(async () => {
    await adapter?.close();
    adapter = undefined;
    vi.restoreAllMocks();
  });

  it("casts a string timeout to an integer", async () => {
    adapter = new BetterSQLite3Adapter({ database: ":memory:", timeout: "5000" });
    const rows = await adapter.execute("PRAGMA busy_timeout");
    expect(Number(rows[0].timeout)).toBe(5000);
  });

  it("raises TypeError when the timeout does not cast to an integer", () => {
    expect(() => new BetterSQLite3Adapter({ database: ":memory:", timeout: "5s" })).toThrow(
      new TypeError("timeout must be integer, not 5s"),
    );
  });

  it("raises ArgumentError when both timeout and retries are given", () => {
    expect(
      () => new BetterSQLite3Adapter({ database: ":memory:", timeout: 5000, retries: 3 }),
    ).toThrow(new ArgumentError("Cannot specify both timeout and retries arguments"));
  });

  it("treats a false timeout and a false retries as unset", async () => {
    const warn = vi.spyOn(deprecator(), "warn").mockImplementation(() => {});
    adapter = new BetterSQLite3Adapter({ database: ":memory:", timeout: false, retries: false });
    await adapter.execute("SELECT 1");
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats a zero timeout as set", async () => {
    adapter = new BetterSQLite3Adapter({ database: ":memory:", timeout: 0 });
    const rows = await adapter.execute("PRAGMA busy_timeout");
    expect(Number(rows[0].timeout)).toBe(0);
  });

  it("deprecates the retries option", async () => {
    const warn = vi.spyOn(deprecator(), "warn").mockImplementation(() => {});
    adapter = new BetterSQLite3Adapter({ database: ":memory:", retries: 3 });
    await adapter.execute("SELECT 1");
    expect(warn).toHaveBeenCalledWith(
      "The retries option is deprecated and will be removed in Rails 8.1. Use timeout instead.\n",
    );
  });
});
