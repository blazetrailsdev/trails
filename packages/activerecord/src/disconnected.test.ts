import { describe, it, expect, beforeEach } from "vitest";
import type { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { adapterType, inMemoryDb } from "./test-adapter.js";

// Ports activerecord/test/cases/disconnected_test.rb. Rails gates the single
// case `unless in_memory_db?` — disconnecting an in-memory SQLite database
// would drop the schema with it.
describe.skipIf(inMemoryDb())("TestDisconnectedAdapter", () => {
  // Rails declares no fixtures; the case only needs the canonical `products`
  // table to exist. The disconnect/reconnect lifecycle is meaningless inside a
  // wrapping transaction (the disconnect would sever it mid-flight), so the
  // case opts out via `usesTransaction`, like AdapterConnectionTest's
  // disconnect cases in adapter.test.ts.
  fixtures([], {
    usesTransaction: ["reconnects to execute statements when disconnected"],
  });

  let connection: AbstractAdapter;

  beforeEach(() => {
    // Rails: `@connection = ActiveRecord::Base.lease_connection`.
    connection = Base.connection;
  });

  // Rails reads the private `@raw_connection` ivar via `instance_variable_get`
  // and compares `__id__`s; object identity stands in for `__id__`. PG and
  // MySQL keep the raw handle in the base `_connection` slot; sqlite keeps it
  // in `driver`, where a closed handle plays `@raw_connection = nil` (the
  // adapter closes in place rather than nil-ing the field), so a closed
  // driver maps to null here.
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
