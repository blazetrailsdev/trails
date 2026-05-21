import { describe, it, expect } from "vitest";
import {
  Database,
  MySQL2,
  PostgreSQL,
  SQLite3,
  Trilogy,
  MariaDBMySQL2,
  MariaDBTrilogy,
} from "./database.js";

describe("Database", () => {
  it("build dispatches on name", () => {
    expect(Database.build("mysql")).toBeInstanceOf(MySQL2);
    expect(Database.build("postgresql")).toBeInstanceOf(PostgreSQL);
    expect(Database.build("sqlite3")).toBeInstanceOf(SQLite3);
    expect(Database.build("trilogy")).toBeInstanceOf(Trilogy);
    expect(Database.build("mariadb-mysql")).toBeInstanceOf(MariaDBMySQL2);
    expect(Database.build("mariadb-trilogy")).toBeInstanceOf(MariaDBTrilogy);
    expect(Database.build("unknown")).toBeInstanceOf(SQLite3);
  });

  it("all returns the five canonical adapters", () => {
    expect(Database.all().map((d) => d.name)).toEqual([
      "mysql",
      "postgres",
      "sqlite3",
      "mariadb",
      "mariadb",
    ]);
  });

  it("postgresql packages, service, feature, volume", () => {
    const db = new PostgreSQL();
    expect(db.pkgDependency).toEqual({ name: "pg", version: "^8.19.0" });
    expect(db.basePackage).toBe("postgresql-client");
    expect(db.port).toBe(5432);
    expect(db.service?.image).toBe("postgres:16.1");
    expect(db.volume).toBe("postgres-data");
    expect(db.feature).toEqual({ "ghcr.io/rails/devcontainer/features/postgres-client": {} });
  });

  it("sqlite3 has no service or build package", () => {
    const db = new SQLite3();
    expect(db.service).toBeUndefined();
    expect(db.port).toBeUndefined();
    expect(db.buildPackage).toBeUndefined();
    expect(db.volume).toBeUndefined();
    expect(db.pkgDependency.name).toBe("better-sqlite3");
  });

  it("trilogy keeps MySQL service but drops apt packages and gets its own gem", () => {
    const db = new Trilogy();
    expect(db.service?.image).toBe("mysql/mysql-server:8.0");
    expect(db.pkgDependency.name).toBe("trilogy");
    expect(db.basePackage).toBeUndefined();
    expect(db.featureName).toBeUndefined();
  });

  it("mariadb variants override name and service", () => {
    expect(new MariaDBMySQL2().name).toBe("mariadb");
    expect(new MariaDBMySQL2().service?.image).toBe("mariadb:10.5");
    expect(new MariaDBTrilogy().pkgDependency.name).toBe("trilogy");
  });
});
