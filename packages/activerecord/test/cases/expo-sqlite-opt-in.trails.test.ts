import { describe, it, expect } from "vitest";
import { ConnectionAdapters } from "../../lib/namespaces.js";
import "../../lib/connection-adapters.js";

describe("the expo-sqlite adapter is opt-in", () => {
  it("stays a registered adapter name", () => {
    expect(ConnectionAdapters.adapters.get("expo-sqlite")).toEqual([
      "ActiveRecord::ConnectionAdapters::ExpoSQLiteAdapter",
      "active_record/connection_adapters/expo_sqlite_adapter",
    ]);
  });

  it("is absent from the autoload map, so nothing reaches it by default", () => {
    expect(Object.keys(ConnectionAdapters.loadPath)).not.toContain(
      "active_record/connection_adapters/expo_sqlite_adapter",
    );
  });

  it("leaves every other sqlite adapter autoloadable", () => {
    const paths = Object.keys(ConnectionAdapters.loadPath);
    expect(paths).toContain("active_record/connection_adapters/better_sqlite3_adapter");
    expect(paths).toContain("active_record/connection_adapters/node_sqlite_adapter");
  });
});
