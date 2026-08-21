import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import type { DatabaseConfig } from "./database-configurations/database-config.js";
import { ConnectionNotDefined } from "./errors.js";

class TestRecord extends Base {}

describe("TestUnconnectedAdapter", () => {
  let underlying: { active(): Promise<boolean> };
  // Rails' `remove_connection` hands back the db_config the pool was opened
  // from, and teardown re-establishes it — the ambient `arunit` connection is
  // never named or rebuilt by hand here.
  let connectionName: DatabaseConfig | undefined;

  beforeEach(async () => {
    underlying = (await Base.leaseConnection()) as unknown as { active(): Promise<boolean> };
    connectionName = Base.removeConnection();
  });

  // Rails pairs the re-establish with `load_schema if in_memory_db?` — removing
  // the connection destroys an in-memory database along with it. The ambient
  // connection is a file, so the schema survives and there is nothing to reload.
  afterEach(async () => {
    await Base.establishConnection(connectionName);
  });

  it("connection no longer established", async () => {
    await expect(TestRecord.find(1)).rejects.toThrow(ConnectionNotDefined);
    await expect(new TestRecord().save()).rejects.toThrow(ConnectionNotDefined);
  });

  it("error message when connection not established", async () => {
    // Rails' `error = assert_raise(...) { ... }` both asserts the raise and hands
    // back the exception; vitest's `rejects.toThrow` returns nothing, so the
    // rejection is captured first and re-thrown into the raise assertion.
    const error = await TestRecord.find(1).catch((e: unknown) => e);
    expect(() => {
      throw error;
    }).toThrow(ConnectionNotDefined);
    expect((error as ConnectionNotDefined).message).toBe("No database connection defined.");
  });

  it("underlying adapter no longer active", async () => {
    expect(await underlying.active()).toBeFalsy();
  });
});
