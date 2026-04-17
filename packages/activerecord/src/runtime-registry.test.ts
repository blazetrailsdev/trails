import { describe, it, expect, beforeEach } from "vitest";
import { Stats, record, stats, reset } from "./runtime-registry.js";
import { Notifications } from "@blazetrails/activesupport";

describe("RuntimeRegistryTest", () => {
  beforeEach(() => {
    reset();
  });

  it("sql runtime defaults to zero", () => {
    expect(stats().sqlRuntime).toBe(0);
  });

  it("record increments sql runtime", () => {
    record("User Load", 5.0);
    expect(stats().sqlRuntime).toBe(5.0);
  });

  it("record increments queries count", () => {
    record("User Load", 1.0);
    record("Post Load", 2.0);
    expect(stats().queriesCount).toBe(2);
  });

  it("record does not count TRANSACTION queries", () => {
    record("TRANSACTION", 1.0);
    expect(stats().queriesCount).toBe(0);
    expect(stats().sqlRuntime).toBe(1.0);
  });

  it("record does not count SCHEMA queries", () => {
    record("SCHEMA", 1.0);
    expect(stats().queriesCount).toBe(0);
  });

  it("record increments cached queries count when cached", () => {
    record("User Load", 0.1, { cached: true });
    expect(stats().cachedQueriesCount).toBe(1);
    expect(stats().queriesCount).toBe(1);
  });

  it("record tracks async sql runtime separately", () => {
    record("User Load", 10.0, { async: true, lockWait: 3.0 });
    expect(stats().asyncSqlRuntime).toBe(7.0);
    expect(stats().sqlRuntime).toBe(10.0);
  });

  it("resetRuntimes returns previous sql runtime and resets", () => {
    record("User Load", 5.0);
    record("Post Load", 3.0, { async: true });
    const was = stats().resetRuntimes();
    expect(was).toBe(8.0);
    expect(stats().sqlRuntime).toBe(0);
    expect(stats().asyncSqlRuntime).toBe(0);
    // queries count is not reset by resetRuntimes
    expect(stats().queriesCount).toBe(2);
  });

  it("reset clears all stats", () => {
    record("User Load", 5.0);
    record("Post Load", 1.0, { cached: true });
    reset();
    expect(stats().sqlRuntime).toBe(0);
    expect(stats().queriesCount).toBe(0);
    expect(stats().cachedQueriesCount).toBe(0);
  });

  it("Stats class initializes with zeros", () => {
    const s = new Stats();
    expect(s.sqlRuntime).toBe(0);
    expect(s.asyncSqlRuntime).toBe(0);
    expect(s.queriesCount).toBe(0);
    expect(s.cachedQueriesCount).toBe(0);
  });

  it("notification subscription records sql.active_record events", () => {
    Notifications.instrument("sql.active_record", { name: "User Load" }, () => {
      // simulate query work
    });
    expect(stats().queriesCount).toBe(1);
    expect(stats().sqlRuntime).toBeGreaterThanOrEqual(0);
  });
});
