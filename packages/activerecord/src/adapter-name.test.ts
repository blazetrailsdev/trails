import { describe, it, expect, afterEach } from "vitest";
import { detectAdapterName } from "./adapter-name.js";

describe("detectAdapterName", () => {
  it("returns postgres for PostgresAdapter", () => {
    class PostgreSQLAdapter {}
    expect(detectAdapterName(new PostgreSQLAdapter() as any)).toBe("postgres");
  });

  it("returns postgres for any class containing Postgres", () => {
    class MyPostgresCustomAdapter {}
    expect(detectAdapterName(new MyPostgresCustomAdapter() as any)).toBe("postgres");
  });

  it("returns mysql for MysqlAdapter", () => {
    class Mysql2Adapter {}
    expect(detectAdapterName(new Mysql2Adapter() as any)).toBe("mysql");
  });

  it("returns mysql for MariaDB adapter", () => {
    class MariaDbAdapter {}
    expect(detectAdapterName(new MariaDbAdapter() as any)).toBe("mysql");
  });

  it("returns sqlite for null adapter", () => {
    expect(detectAdapterName(null)).toBe("sqlite");
  });

  it("returns sqlite for undefined adapter", () => {
    expect(detectAdapterName(undefined)).toBe("sqlite");
  });

  it("returns sqlite for unknown adapter class", () => {
    class UnknownAdapter {}
    expect(detectAdapterName(new UnknownAdapter() as any)).toBe("sqlite");
  });

  describe("SchemaAdapter env-based detection", () => {
    const originalPG = process.env.PG_TEST_URL;
    const originalMySQL = process.env.MYSQL_TEST_URL;

    afterEach(() => {
      if (originalPG !== undefined) process.env.PG_TEST_URL = originalPG;
      else delete process.env.PG_TEST_URL;
      if (originalMySQL !== undefined) process.env.MYSQL_TEST_URL = originalMySQL;
      else delete process.env.MYSQL_TEST_URL;
    });

    class SchemaAdapter {}

    it("returns postgres for SchemaAdapter when PG_TEST_URL is set", () => {
      process.env.PG_TEST_URL = "postgres://localhost/test";
      delete process.env.MYSQL_TEST_URL;
      expect(detectAdapterName(new SchemaAdapter() as any)).toBe("postgres");
    });

    it("returns mysql for SchemaAdapter when MYSQL_TEST_URL is set", () => {
      delete process.env.PG_TEST_URL;
      process.env.MYSQL_TEST_URL = "mysql://localhost/test";
      expect(detectAdapterName(new SchemaAdapter() as any)).toBe("mysql");
    });

    it("returns sqlite for SchemaAdapter when no env vars set", () => {
      delete process.env.PG_TEST_URL;
      delete process.env.MYSQL_TEST_URL;
      expect(detectAdapterName(new SchemaAdapter() as any)).toBe("sqlite");
    });
  });
});
