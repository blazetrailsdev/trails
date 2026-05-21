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
  it("build dispatches on name and defaults to sqlite3", () => {
    expect(Database.build("mysql")).toBeInstanceOf(MySQL2);
    expect(Database.build("postgresql")).toBeInstanceOf(PostgreSQL);
    expect(Database.build("sqlite3")).toBeInstanceOf(SQLite3);
    expect(Database.build("trilogy")).toBeInstanceOf(Trilogy);
    expect(Database.build("mariadb-mysql")).toBeInstanceOf(MariaDBMySQL2);
    expect(Database.build("mariadb-trilogy")).toBeInstanceOf(MariaDBTrilogy);
    expect(Database.build("unknown")).toBeInstanceOf(SQLite3);
    expect(Database.all().map((d) => d.name)).toEqual([
      "mysql",
      "postgres",
      "sqlite3",
      "mariadb",
      "mariadb",
    ]);
  });

  it("each adapter exposes packages, service, feature, volume", () => {
    const pg = new PostgreSQL();
    expect(pg.pkgDependency).toEqual({ name: "pg", version: "^8.19.0" });
    expect(pg.basePackage).toBe("postgresql-client");
    expect(pg.port).toBe(5432);
    expect(pg.service?.image).toBe("postgres:16.1");
    expect(pg.volume).toBe("postgres-data");
    expect(pg.feature).toEqual({ "ghcr.io/rails/devcontainer/features/postgres-client": {} });

    const sl = new SQLite3();
    expect(sl.service).toBeUndefined();
    expect(sl.buildPackage).toBeUndefined();
    expect(sl.volume).toBeUndefined();
    expect(sl.pkgDependency.name).toBe("better-sqlite3");
  });

  it("trilogy and mariadb variants inherit and override", () => {
    const tr = new Trilogy();
    expect(tr.service?.image).toBe("mysql/mysql-server:8.0");
    expect(tr.pkgDependency.name).toBe("trilogy");
    expect(tr.basePackage).toBeUndefined();
    expect(new MariaDBMySQL2().name).toBe("mariadb");
    expect(new MariaDBMySQL2().service?.image).toBe("mariadb:10.5");
    expect(new MariaDBTrilogy().pkgDependency.name).toBe("trilogy");
  });
});
