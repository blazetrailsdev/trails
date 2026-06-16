import { beforeEach, afterEach, it, expect } from "vitest";
import { Base } from "./base.js";
import { describeIfMysql } from "./adapters/abstract-mysql-adapter/test-helper.js";

// Mirrors: activerecord/test/cases/invalid_connection_test.rb
//
// Rails gates this on `current_adapter?(:Mysql2Adapter, :TrilogyAdapter)`
// because sqlite3 would create a database file on the fly, so the connection
// config would never be "invalid". We mirror that gate with describeIfMysql.
describeIfMysql("TestAdapterWithInvalidConnection", () => {
  class Bird extends Base {}

  beforeEach(async () => {
    // Can't just use the current adapter; sqlite3 will create a database
    // file on the fly.
    await Bird.establishConnection({
      adapter: "mysql2",
      database: "i_do_not_exist",
      host: "127.0.0.1",
      port: 12,
      username: "invalid",
    });
  });

  afterEach(() => {
    Bird.removeConnection();
  });

  it("inspect on Model class does not raise", () => {
    expect(Bird.inspect()).toBe(
      `${Bird.name} (call '${Bird.name}.load_schema' to load schema informations)`,
    );
  });
});
