// Quoter-threading parity. PG/SQLite drop the table prefix in
// quote_table_name_for_assignment (Rails sanitization.rb:112,
// postgresql/quoting.rb:133, sqlite3/quoting.rb:70).
import { describe, it, expect } from "vitest";
import { ClassMethods } from "./sanitization.js";
import {
  sanitizeSqlForAssignment,
  sanitizeSqlHashForAssignment,
  sanitizeSqlForConditions,
  type Quoter,
} from "./sanitization.js";
import { ConnectionNotDefined, ConnectionTimeoutError } from "./errors.js";

const dq = (n: string) => `"${n.replace(/"/g, '""')}"`;
const bq = (n: string) => `\`${n.replace(/`/g, "``")}\``;
const quoteVal = (v: unknown) => (typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v));

const sqliteQuoter: Quoter = {
  quote: quoteVal,
  quoteIdentifier: dq,
  quoteTableNameForAssignment: (_t, a) => dq(a),
  quoteString: (s) => s.replace(/'/g, "''"),
  castBoundValue: (v) => v,
};
const pgQuoter: Quoter = { ...sqliteQuoter };
const mysqlQuoter: Quoter = {
  quote: quoteVal,
  quoteIdentifier: bq,
  quoteTableNameForAssignment: (t, a) => `${bq(t)}.${bq(a)}`,
  quoteString: (s) => s.replace(/'/g, "''"),
  castBoundValue: (v) => v,
};

describe("sanitization quoter threading (module-level)", () => {
  it("MySQL emits backtick-qualified `table`.`column` for hash assignment", () => {
    expect(sanitizeSqlHashForAssignment({ name: "x" }, "users", undefined, mysqlQuoter)).toBe(
      "`users`.`name` = 'x'",
    );
  });

  it("PostgreSQL drops the table prefix for hash assignment (Rails parity)", () => {
    expect(sanitizeSqlHashForAssignment({ name: "x" }, "users", undefined, pgQuoter)).toBe(
      `"name" = 'x'`,
    );
  });

  it("SQLite drops the table prefix for hash assignment (Rails parity)", () => {
    expect(sanitizeSqlHashForAssignment({ name: "x" }, "users", undefined, sqliteQuoter)).toBe(
      `"name" = 'x'`,
    );
  });

  it("sanitizeSqlForAssignment hash form threads quoter for MySQL", () => {
    expect(sanitizeSqlForAssignment({ name: "x" }, "users", mysqlQuoter)).toBe(
      "`users`.`name` = 'x'",
    );
  });

  it("sanitizeSqlForConditions array form threads quoter through `?` binds", () => {
    expect(sanitizeSqlForConditions(["name = ?", "x"], mysqlQuoter)).toBe("name = 'x'");
  });
});

describe("sanitization class-method dispatch threads `this.connection`", () => {
  const mysqlHost = { connection: mysqlQuoter };
  const pgHost = { connection: pgQuoter };

  it("sanitizeSqlHashForAssignment uses MySQL adapter from this.connection", () => {
    expect(ClassMethods.sanitizeSqlHashForAssignment.call(mysqlHost, { name: "x" }, "users")).toBe(
      "`users`.`name` = 'x'",
    );
  });

  it("sanitizeSqlHashForAssignment uses PG adapter from this.connection", () => {
    expect(ClassMethods.sanitizeSqlHashForAssignment.call(pgHost, { name: "x" }, "users")).toBe(
      `"name" = 'x'`,
    );
  });

  it("sanitizeSqlArray uses dialect quoter for `?` binds", () => {
    expect(ClassMethods.sanitizeSqlArray.call(mysqlHost, "name = ?", "x")).toBe("name = 'x'");
  });

  it("falls back to abstract quoter when host.connection throws ConnectionNotDefined", () => {
    const host = {
      get connection(): never {
        throw new ConnectionNotDefined("No database connection defined.");
      },
    };
    expect(ClassMethods.sanitizeSqlHashForAssignment.call(host, { name: "x" }, "users")).toBe(
      `"users"."name" = 'x'`,
    );
  });

  it("propagates non-ConnectionNotDefined errors from host.connection", () => {
    const host = {
      get connection(): never {
        throw new ConnectionTimeoutError("connection timed out");
      },
    };
    expect(() =>
      ClassMethods.sanitizeSqlHashForAssignment.call(host, { name: "x" }, "users"),
    ).toThrow(ConnectionTimeoutError);
  });
});
