import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import type { DatabaseConfig } from "./database-configurations/database-config.js";
import { ConnectionNotDefined } from "./errors.js";

class TestRecord extends Base {}

describe("TestUnconnectedAdapter", () => {
  let underlying: { active(): Promise<boolean> };
  let connectionName: DatabaseConfig | undefined;

  beforeEach(async () => {
    underlying = (await Base.leaseConnection()) as unknown as { active(): Promise<boolean> };
    connectionName = Base.removeConnection();
  });

  afterEach(async () => {
    await Base.establishConnection(connectionName);
  });

  it("connection no longer established", async () => {
    await expect(TestRecord.find(1)).rejects.toThrow(ConnectionNotDefined);
    await expect(new TestRecord().save()).rejects.toThrow(ConnectionNotDefined);
  });

  it("error message when connection not established", async () => {
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
