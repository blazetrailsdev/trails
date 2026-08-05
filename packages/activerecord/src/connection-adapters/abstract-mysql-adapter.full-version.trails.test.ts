import { describe, it, expect } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { Version } from "./abstract-adapter.js";

// Trails-specific guard (no Rails counterpart, because Rails cannot reach the
// state through MySQL): #full_version is a bare
// `database_version.full_version_string` (mysql2_adapter.rb:164-166) and every
// MySQL Version is built with both arguments (abstract_mysql_adapter.rb:86-90),
// so nil is unobservable on that adapter. It stays reachable on the class —
// `full_version_string` defaults to nil (abstract_adapter.rb:248) and
// SQLite3Adapter#get_database_version builds one that way
// (sqlite3_adapter.rb:477) — so these pin both arms. #full_version used to
// substitute "" for the nil, which answered #mariadb? "no" for a server it had
// never asked.
describe("Mysql2Adapter#full_version", () => {
  function adapterWith(version: Version): Mysql2Adapter {
    const adapter = new Mysql2Adapter({ host: "localhost" });
    (adapter as unknown as { _databaseVersion: Version })._databaseVersion = version;
    return adapter;
  }

  it("answers the full version string the Version carries", () => {
    expect(adapterWith(new Version("10.6.5", "5.5.5-10.6.5-MariaDB")).fullVersion()).toBe(
      "5.5.5-10.6.5-MariaDB",
    );
    expect(adapterWith(new Version("10.6.5", "5.5.5-10.6.5-MariaDB")).isMariadb()).toBe(true);
  });

  it("answers nil, not an empty string, when the Version carries none", () => {
    expect(adapterWith(new Version("10.6.5")).fullVersion()).toBeNull();
    expect(adapterWith(new Version("10.6.5")).isMariadb()).toBe(false);
  });
});
