import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import type { DatabaseConfig } from "./database-configurations/database-config.js";
import { ConnectionNotDefined } from "./errors.js";

class TestRecord extends Base {}

describe("TestUnconnectedAdapter", () => {
  let underlying: { active: boolean };
  // Rails' `remove_connection` hands back the db_config the pool was opened
  // from, and teardown re-establishes it — the ambient `arunit` connection is
  // never named or rebuilt by hand here.
  let connectionName: DatabaseConfig | undefined;

  beforeEach(async () => {
    underlying = (await Base.leaseConnection()) as unknown as { active: boolean };
    connectionName = Base.removeConnection();
  });

  afterEach(async () => {
    await Base.establishConnection(connectionName);
  });

  it("connection no longer established", async () => {
    await expect(TestRecord.find(1)).rejects.toBeInstanceOf(ConnectionNotDefined);
    await expect(new TestRecord().save()).rejects.toBeInstanceOf(ConnectionNotDefined);
  });

  it("error message when connection not established", async () => {
    const err = await TestRecord.find(1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectionNotDefined);
    expect((err as ConnectionNotDefined).message).toBe("No database connection defined.");
  });

  it("underlying adapter no longer active", () => {
    expect(underlying.active).toBe(false);
  });
});
