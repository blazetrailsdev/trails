import { describe, it, expect } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { mysql2Client } from "../mysql2/client.js";

class FakeConnection {
  connection = { _handshakePacket: { serverVersion: "8.0.28" } };
  end(): Promise<void> {
    return Promise.resolve();
  }
  ping(): Promise<void> {
    return Promise.resolve();
  }
  query(): Promise<unknown[]> {
    return Promise.resolve([[]]);
  }
}

describe("Mysql2Adapter#verify! with a connection handed to the constructor", () => {
  it("seats the unconfigured connection with usable query_options", async () => {
    const adapter = new Mysql2Adapter(mysql2Client(new FakeConnection()), null, {}, {});

    await adapter.verifyBang();

    expect(adapter._rawConnection!.queryOptions.as).toBe("array");
    expect(adapter._rawConnection!.queryOptions).toHaveProperty("databaseTimezone");
  });
});
