import { describe, it, expect, beforeEach } from "vitest";
import {
  sqlRuntime,
  asyncSqlRuntime,
  queriesCount,
  cachedQueriesCount,
  resetRuntimes,
  reset,
} from "./runtime-registry.js";
import { Notifications, NotificationEvent } from "@blazetrails/activesupport";

function instrumentSql(
  name: string,
  runtime: number,
  payload: { cached?: boolean; async?: boolean; lockWait?: number } = {},
): void {
  Notifications.publishEvent(
    new NotificationEvent("sql.active_record", 0, runtime / 1_000.0, "", { name, ...payload }),
  );
}

describe("RuntimeRegistryTest", () => {
  beforeEach(() => {
    reset();
  });

  it("sql runtime defaults to zero", () => {
    expect(sqlRuntime()).toBe(0);
  });

  it("instrumented sql event increments sql runtime", () => {
    instrumentSql("User Load", 5.0);
    expect(sqlRuntime()).toBe(5.0);
  });

  it("instrumented sql event increments queries count", () => {
    instrumentSql("User Load", 1.0);
    instrumentSql("Post Load", 2.0);
    expect(queriesCount()).toBe(2);
  });

  it("instrumented sql event does not count TRANSACTION queries", () => {
    instrumentSql("TRANSACTION", 1.0);
    expect(queriesCount()).toBe(0);
    expect(sqlRuntime()).toBe(1.0);
  });

  it("instrumented sql event does not count SCHEMA queries", () => {
    instrumentSql("SCHEMA", 1.0);
    expect(queriesCount()).toBe(0);
  });

  it("instrumented sql event increments cached queries count when cached", () => {
    instrumentSql("User Load", 0.1, { cached: true });
    expect(cachedQueriesCount()).toBe(1);
    expect(queriesCount()).toBe(1);
  });

  it("instrumented sql event tracks async sql runtime separately", () => {
    instrumentSql("User Load", 10.0, { async: true, lockWait: 3.0 });
    expect(asyncSqlRuntime()).toBe(7.0);
    expect(sqlRuntime()).toBe(10.0);
  });

  it("resetRuntimes returns previous sql runtime and resets", () => {
    instrumentSql("User Load", 5.0);
    instrumentSql("Post Load", 3.0, { async: true });
    const was = resetRuntimes();
    expect(was).toBe(8.0);
    expect(sqlRuntime()).toBe(0);
    expect(asyncSqlRuntime()).toBe(0);
    expect(queriesCount()).toBe(2);
  });

  it("reset clears all stats", () => {
    instrumentSql("User Load", 5.0);
    instrumentSql("Post Load", 1.0, { cached: true });
    reset();
    expect(sqlRuntime()).toBe(0);
    expect(queriesCount()).toBe(0);
    expect(cachedQueriesCount()).toBe(0);
  });

  it("notification subscription records sql.active_record events", () => {
    Notifications.instrument("sql.active_record", { name: "User Load" }, () => {});
    expect(queriesCount()).toBe(1);
    expect(sqlRuntime()).toBeGreaterThanOrEqual(0);
  });
});
