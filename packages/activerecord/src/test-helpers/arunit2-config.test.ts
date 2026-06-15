import { describe, expect, it } from "vitest";
import {
  arunit2Url,
  arunitDatabaseNames,
  databaseName,
  resolveSecondDatabaseConfig,
} from "./arunit2-config.js";

/** A stub env reader backed by a fixed map (no ambient env mutation). */
function reader(env: Record<string, string | undefined>): (key: string) => string | undefined {
  return (key) => env[key];
}

describe("arunit2-config", () => {
  it("databaseName strips the leading slash from the URL path", () => {
    expect(databaseName("mysql://root@localhost:3306/rails_js_test")).toBe("rails_js_test");
    expect(databaseName("postgres://localhost/ar_test")).toBe("ar_test");
  });

  it("arunitDatabaseNames suffixes the primary database name", () => {
    expect(arunitDatabaseNames("mysql://root@localhost:3306/rails_js_test")).toEqual({
      arunit: "rails_js_test_arunit",
      arunit2: "rails_js_test_arunit2",
    });
  });

  it("arunit2Url swaps the database while preserving host, port, and credentials", () => {
    expect(arunit2Url("mysql://root:pw@db.example:3307/rails_js_test")).toBe(
      "mysql://root:pw@db.example:3307/rails_js_test_arunit2",
    );
  });

  it("resolves Postgres when PG_TEST_URL is set", () => {
    expect(
      resolveSecondDatabaseConfig(reader({ PG_TEST_URL: "postgres://localhost/ar_test" })),
    ).toEqual({ adapter: "postgres", config: "postgres://localhost/ar_test_arunit2" });
  });

  it("resolves MySQL when MYSQL_TEST_URL is set and PG is not", () => {
    expect(
      resolveSecondDatabaseConfig(
        reader({ MYSQL_TEST_URL: "mysql://root@localhost:3306/rails_js_test" }),
      ),
    ).toEqual({ adapter: "mysql", config: "mysql://root@localhost:3306/rails_js_test_arunit2" });
  });

  it("prefers Postgres over MySQL when both URLs are present", () => {
    expect(
      resolveSecondDatabaseConfig(
        reader({
          PG_TEST_URL: "postgres://localhost/ar_test",
          MYSQL_TEST_URL: "mysql://root@localhost:3306/rails_js_test",
        }),
      ).adapter,
    ).toBe("postgres");
  });

  it("falls back to a separate in-memory SQLite pool with no env URLs", () => {
    expect(resolveSecondDatabaseConfig(reader({}))).toEqual({
      adapter: "sqlite",
      config: { adapter: "sqlite3", database: ":memory:", pool: 1 },
    });
  });
});
