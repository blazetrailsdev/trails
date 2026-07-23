import { describe, it, expect, beforeEach } from "vitest";
import type { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { adapterType, inMemoryDb } from "./test-adapter.js";

describe.skipIf(inMemoryDb())("TestDisconnectedAdapter", () => {
  fixtures([], {
    usesTransaction: ["reconnects to execute statements when disconnected"],
  });

  let connection: AbstractAdapter;

  beforeEach(() => {
    connection = Base.connection;
  });

  function rawConnection(conn: AbstractAdapter): unknown {
    const sqlite = conn as unknown as { driver?: { isOpen(): boolean } };
    if (adapterType === "sqlite") {
      return sqlite.driver?.isOpen() ? sqlite.driver : null;
    }
    return (conn as unknown as { _connection: unknown })._connection;
  }

  it("reconnects to execute statements when disconnected", async () => {
    await connection.execute("SELECT count(*) from products");
    const firstConnection = rawConnection(connection);

    connection.disconnectBang();
    expect(rawConnection(connection)).toBeNull();

    await connection.execute("SELECT count(*) from products");
    const secondConnection = rawConnection(connection);

    expect(secondConnection).not.toBe(firstConnection);
  });
});
