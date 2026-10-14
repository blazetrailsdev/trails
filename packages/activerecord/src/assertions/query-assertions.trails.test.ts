import { describe, it, expect, afterEach } from "vitest";
import { SQLCounter, assertQueriesMatch } from "../testing/query-assertions.js";
import { Notifications } from "@blazetrails/activesupport";

function instrumentSql(sql: string, name?: string, cached = false): void {
  Notifications.instrument("sql.active_record", { sql, name: name ?? "SQL", cached });
}

describe("QueryAssertionsTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("assert queries match global regex does not alternate due to lastIndex statefulness", async () => {
    await assertQueriesMatch(/SELECT/gi, 3, false, async () => {
      instrumentSql("SELECT 1");
      instrumentSql("SELECT 2");
      instrumentSql("SELECT 3");
    });
  });

  it("SQLCounter skips cached queries", () => {
    const counter = new SQLCounter();
    counter.call("sql.active_record", "id1", { sql: "SELECT 1", cached: true });
    expect(counter.logAll).toHaveLength(0);
    expect(counter.log).toHaveLength(0);
  });

  it("SQLCounter separates schema from non-schema", () => {
    const counter = new SQLCounter();
    counter.call("sql.active_record", "id1", {
      sql: "SELECT attname FROM pg_attribute",
      name: "SCHEMA",
    });
    counter.call("sql.active_record", "id2", { sql: "SELECT 1", name: "SQL" });
    expect(counter.logAll).toHaveLength(2);
    expect(counter.log).toHaveLength(1);
    expect(counter.log[0]).toBe("SELECT 1");
  });
});
