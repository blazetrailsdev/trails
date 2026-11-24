import { describe, it, expect, afterEach, vi } from "vitest";
import { SQLite3Adapter } from "../../../lib/connection-adapters/sqlite3-adapter.js";
import { deprecator } from "../../../lib/deprecator.js";
import { SQLite3 } from "@blazetrails/sqlite3";

describe("SQLite3Adapter timeout config coercion", () => {
  let adapter: SQLite3Adapter | undefined;

  afterEach(async () => {
    await adapter?.disconnectBang();
    adapter = undefined;
    vi.restoreAllMocks();
  });

  it("casts a string timeout to an integer", async () => {
    adapter = new SQLite3Adapter({ database: ":memory:", timeout: "5000" });
    const set = vi.spyOn(SQLite3.Database.prototype, "setBusyHandlerTimeout");
    await adapter.connectBang();
    expect(set).toHaveBeenCalledWith(5000);
  });

  it("raises TypeError when the timeout does not cast to an integer", async () => {
    adapter = new SQLite3Adapter({ database: ":memory:", timeout: "5s" });
    await expect(adapter.connectBang()).rejects.toThrow("timeout must be integer, not 5s");
    adapter = undefined;
  });

  it("raises ArgumentError when both timeout and retries are given", async () => {
    adapter = new SQLite3Adapter({ database: ":memory:", timeout: 5000, retries: 3 });
    await expect(adapter.connectBang()).rejects.toThrow(
      "Cannot specify both timeout and retries arguments",
    );
    adapter = undefined;
  });

  it("treats a false timeout and a false retries as unset", async () => {
    const warn = vi.spyOn(deprecator(), "warn").mockImplementation(() => undefined);
    adapter = new SQLite3Adapter({ database: ":memory:", timeout: false, retries: false });
    await adapter.execute("SELECT 1");
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats a zero timeout as set", async () => {
    adapter = new SQLite3Adapter({ database: ":memory:", timeout: 0 });
    const set = vi.spyOn(SQLite3.Database.prototype, "setBusyHandlerTimeout");
    await adapter.connectBang();
    expect(set).toHaveBeenCalledWith(0);
  });

  it("deprecates the retries option", async () => {
    const warn = vi.spyOn(deprecator(), "warn").mockImplementation(() => undefined);
    adapter = new SQLite3Adapter({ database: ":memory:", retries: 3 });
    await adapter.execute("SELECT 1");
    expect(warn).toHaveBeenCalledWith(
      "The retries option is deprecated and will be removed in Rails 8.1. Use timeout instead.\n",
    );
  });
});
