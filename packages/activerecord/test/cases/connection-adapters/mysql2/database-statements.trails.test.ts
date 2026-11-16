import { afterEach, describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { DatabaseStatements } from "../../../../lib/connection-adapters/mysql2/database-statements.js";
import { ExplainRegistry } from "../../../../lib/explain-registry.js";

class AbstractHost {
  preparedStatements = true;
  unprepared = false;
  calls: boolean[] = [];

  selectAll(): string {
    this.calls.push(this.unprepared);
    return "result";
  }

  unpreparedStatement<T>(fn: () => T): T {
    this.unprepared = true;
    try {
      return fn();
    } finally {
      this.unprepared = false;
    }
  }
}

class Host extends AbstractHost {}
include(Host, DatabaseStatements);

describe("Mysql2 DatabaseStatements#selectAll", () => {
  afterEach(() => ExplainRegistry.reset());

  it("runs the abstract selectAll inside unpreparedStatement while explaining with prepared statements", () => {
    const host = new Host();
    ExplainRegistry.collect = true;
    expect(host.selectAll()).toBe("result");
    expect(host.calls).toEqual([true]);
  });

  it("runs the abstract selectAll directly when not explaining or without prepared statements", () => {
    const host = new Host();
    ExplainRegistry.collect = false;
    host.selectAll();
    ExplainRegistry.collect = true;
    host.preparedStatements = false;
    host.selectAll();
    expect(host.calls).toEqual([false, false]);
  });
});
