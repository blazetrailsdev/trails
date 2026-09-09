import { describe, it, expect } from "vitest";
import { HashConfig } from "./hash-config.js";
import { UrlConfig } from "./url-config.js";

describe("UrlConfig", () => {
  it("routes a Windows drive path through ConnectionUrlResolver like Ruby's URI does", () => {
    const config = new UrlConfig("default_env", "primary", "C:/db/x.sqlite3");
    expect(config.adapter).toBe("c");
    expect(config.database).toBe("db/x.sqlite3");
  });

  it("carries a Windows drive path verbatim when it arrives as a database key", () => {
    const config = new HashConfig("default_env", "primary", {
      adapter: "sqlite3",
      database: "C:/db/x.sqlite3",
    });
    expect(config.database).toBe("C:/db/x.sqlite3");
  });

  it("reports database through configurationHash for each adapter's URL", () => {
    const sqlite3 = new UrlConfig("default_env", "primary", "sqlite3:db/development.sqlite3");
    expect(sqlite3.database).toBe("db/development.sqlite3");
    expect(sqlite3.configurationHash.database).toBe("db/development.sqlite3");

    const postgresql = new UrlConfig(
      "default_env",
      "primary",
      "postgresql://user:pass@localhost:5432/foo",
    );
    expect(postgresql.database).toBe("foo");
    expect(postgresql.configurationHash.database).toBe("foo");

    const mysql2 = new UrlConfig("default_env", "primary", "mysql2://localhost/bar");
    expect(mysql2.database).toBe("bar");
    expect(mysql2.configurationHash.database).toBe("bar");
  });
});
