import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "./base.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { ConnectionNotDefined } from "./errors.js";

class TestRecord extends Base {}

describe("TestUnconnectedAdapter", () => {
  let underlying: { active: boolean };

  beforeEach(() => {
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "primary", { adapter: "sqlite3", database: ":memory:", pool: 1 }),
      { owner: "Base" },
    );
    underlying = Base.leaseConnection() as unknown as { active: boolean };
    Base.removeConnection();
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
