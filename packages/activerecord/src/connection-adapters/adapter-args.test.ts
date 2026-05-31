import { describe, it, expect } from "vitest";
import { buildAdapterArg, normalizeAdapterName, parseSqliteUrl } from "./adapter-args.js";

describe("buildAdapterArg", () => {
  describe("sqlite", () => {
    it("returns [filename] when no adapter options are set", () => {
      expect(buildAdapterArg("sqlite3", { adapter: "sqlite3", database: "x.db" })).toEqual([
        "x.db",
      ]);
    });

    it("preserves SQLite adapter options as the second constructor arg", () => {
      const args = buildAdapterArg("sqlite3", {
        adapter: "sqlite3",
        database: "x.db",
        readonly: true,
        strict: true,
        pragmas: { journal_mode: "WAL", synchronous: "NORMAL" },
        statementLimit: 64,
      });
      expect(args).toEqual([
        "x.db",
        {
          readonly: true,
          strict: true,
          pragmas: { journal_mode: "WAL", synchronous: "NORMAL" },
          statementLimit: 64,
        },
      ]);
    });

    it("ignores unrelated database.yml keys (pool, host, etc.)", () => {
      const args = buildAdapterArg("sqlite3", {
        adapter: "sqlite3",
        database: "x.db",
        pool: 5,
        host: "ignored",
        strict: true,
      });
      expect(args).toEqual(["x.db", { strict: true }]);
    });

    it("parses sqlite3:// URLs", () => {
      expect(
        buildAdapterArg("sqlite3", { adapter: "sqlite3", url: "sqlite3://memory.db" }),
      ).toEqual(["memory.db"]);
    });

    it("defaults to :memory: when neither url nor database is set", () => {
      expect(buildAdapterArg("sqlite3", { adapter: "sqlite3" })).toEqual([":memory:"]);
    });

    it("prefers explicit database over url (matches non-sqlite precedence)", () => {
      expect(
        buildAdapterArg("sqlite3", {
          adapter: "sqlite3",
          url: "sqlite3://old.db",
          database: "mutated.db",
        }),
      ).toEqual(["mutated.db"]);
    });
  });

  describe("postgresql / mysql2", () => {
    it("returns [url] when only a URL is given", () => {
      expect(
        buildAdapterArg("postgresql", { adapter: "postgresql", url: "postgres://h/db" }),
      ).toEqual(["postgres://h/db"]);
    });

    it("returns [config] hash when keyword config is given", () => {
      const [config] = buildAdapterArg("mysql2", {
        adapter: "mysql2",
        database: "db",
        username: "alice",
        port: 3307,
      });
      expect(config).toMatchObject({
        database: "db",
        user: "alice",
        host: "localhost",
        port: 3307,
      });
    });

    it("remaps socket to socketPath for mysql and omits host", () => {
      const [config] = buildAdapterArg("mysql2", {
        adapter: "mysql2",
        database: "db",
        socket: "/var/run/mysqld/mysqld.sock",
      }) as [Record<string, unknown>];
      expect(config.socketPath).toBe("/var/run/mysqld/mysqld.sock");
      expect(config.socket).toBeUndefined();
      expect(config.host).toBeUndefined();
    });

    it("treats empty socket as absent and falls back to localhost for mysql", () => {
      const [config] = buildAdapterArg("mysql2", {
        adapter: "mysql2",
        database: "db",
        socket: "",
      }) as [Record<string, unknown>];
      expect(config.socketPath).toBeUndefined();
      expect(config.host).toBe("localhost");
    });

    it("does not remap socketPath when already set for mysql", () => {
      const [config] = buildAdapterArg("mysql2", {
        adapter: "mysql2",
        database: "db",
        socket: "/old.sock",
        socketPath: "/new.sock",
      }) as [Record<string, unknown>];
      expect(config.socketPath).toBe("/new.sock");
      expect(config.socket).toBe("/old.sock");
    });

    it("does not suppress host for non-mysql adapters with socketPath", () => {
      const [config] = buildAdapterArg("postgresql", {
        adapter: "postgresql",
        database: "db",
        socketPath: "/var/run/pg",
      }) as [Record<string, unknown>];
      expect(config.host).toBe("localhost");
    });
  });
});

describe("normalizeAdapterName", () => {
  it("maps aliases to canonical names", () => {
    expect(normalizeAdapterName("postgres")).toBe("postgresql");
    expect(normalizeAdapterName("mysql")).toBe("mysql");
    expect(normalizeAdapterName("sqlite3")).toBe("sqlite");
    expect(normalizeAdapterName("custom")).toBe("custom");
  });
});

describe("parseSqliteUrl", () => {
  it("strips sqlite3:// and sqlite:// prefixes", () => {
    expect(parseSqliteUrl("sqlite3://file.db")).toBe("file.db");
    expect(parseSqliteUrl("sqlite://memory.db")).toBe("memory.db");
  });

  it("treats an empty path as :memory:", () => {
    expect(parseSqliteUrl("sqlite3://")).toBe(":memory:");
  });

  it("passes bare paths through unchanged", () => {
    expect(parseSqliteUrl("/tmp/x.db")).toBe("/tmp/x.db");
    expect(parseSqliteUrl(":memory:")).toBe(":memory:");
  });
});
