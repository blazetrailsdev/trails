import { describe, it, expect } from "vitest";
import { ClassMethods, type Quoter } from "./sanitization.js";
import { ConnectionNotDefined, ConnectionTimeoutError } from "./errors.js";

const dq = (n: string) => `"${n.replace(/"/g, '""')}"`;
const bq = (n: string) => `\`${n.replace(/`/g, "``")}\``;
const quoteVal = (v: unknown) => (typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v));

const sqliteQuoter: Quoter = {
  quote: quoteVal,
  quoteColumnName: dq,
  quoteTableNameForAssignment: (_t, a) => dq(a),
  quoteString: (s) => s.replace(/'/g, "''"),
  castBoundValue: (v) => v,
};
const pgQuoter: Quoter = { ...sqliteQuoter };
const mysqlQuoter: Quoter = {
  quote: quoteVal,
  quoteColumnName: bq,
  quoteTableNameForAssignment: (t, a) => `${bq(t)}.${bq(a)}`,
  quoteString: (s) => s.replace(/'/g, "''"),
  castBoundValue: (v) => v,
};

describe("sanitization quoter threading (module-level)", () => {
  const hostFor = (q: Quoter) => ({ connection: q, ...ClassMethods });

  it("MySQL emits backtick-qualified `table`.`column` for hash assignment", () => {
    expect(hostFor(mysqlQuoter).sanitizeSqlHashForAssignment({ name: "x" }, "users")).toBe(
      "`users`.`name` = 'x'",
    );
  });

  it("PostgreSQL drops the table prefix for hash assignment (Rails parity)", () => {
    expect(hostFor(pgQuoter).sanitizeSqlHashForAssignment({ name: "x" }, "users")).toBe(
      `"name" = 'x'`,
    );
  });

  it("SQLite drops the table prefix for hash assignment (Rails parity)", () => {
    expect(hostFor(sqliteQuoter).sanitizeSqlHashForAssignment({ name: "x" }, "users")).toBe(
      `"name" = 'x'`,
    );
  });

  it("sanitizeSqlForAssignment hash form threads quoter for MySQL", () => {
    expect(hostFor(mysqlQuoter).sanitizeSqlForAssignment({ name: "x" }, "users")).toBe(
      "`users`.`name` = 'x'",
    );
  });

  it("sanitizeSqlForConditions array form threads quoter through `?` binds", () => {
    expect(hostFor(mysqlQuoter).sanitizeSqlForConditions(["name = ?", "x"])).toBe("name = 'x'");
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

  it("raises ConnectionNotDefined when host.connection has no adapter", () => {
    const host = {
      get connection(): never {
        throw new ConnectionNotDefined("No database connection defined.");
      },
    };
    expect(() =>
      ClassMethods.sanitizeSqlHashForAssignment.call(host, { name: "x" }, "users"),
    ).toThrow(ConnectionNotDefined);
    expect(() =>
      ClassMethods.sanitizeSqlHashForAssignment.call({}, { name: "x" }, "users"),
    ).toThrow(ConnectionNotDefined);
  });

  it("answers a blank statement without asking for a connection", () => {
    expect(ClassMethods.sanitizeSqlArray.call({}, "")).toBe("");
  });

  it("surfaces the adapter_class lookup error for sanitizeSqlForOrder", () => {
    const host = {
      ...ClassMethods,
      connection: mysqlQuoter,
      adapterClassSync: (): never => {
        throw new ConnectionNotDefined("No database connection defined.");
      },
    };
    expect(() => host.sanitizeSqlForOrder(["id = ?", 1])).toThrow(ConnectionNotDefined);
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
