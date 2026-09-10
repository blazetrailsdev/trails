import { describe, it, expect } from "vitest";
import { ADAPTER_ARG_FAMILIES, buildAdapterArg } from "./adapter-args.js";

describe("buildAdapterArg", () => {
  describe("sqlite", () => {
    it("returns [filename] when no adapter options are set", () => {
      expect(buildAdapterArg("sqlite3", { adapter: "sqlite3", database: "x.db" })).toEqual([
        { database: "x.db" },
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
        {
          readonly: true,
          strict: true,
          pragmas: { journal_mode: "WAL", synchronous: "NORMAL" },
          statementLimit: 64,
          database: "x.db",
        },
      ]);
    });

    it("preserves the SQLite timeout option", () => {
      const args = buildAdapterArg("sqlite3", {
        adapter: "sqlite3",
        database: "x.db",
        timeout: 5000,
        strict: true,
      });
      expect(args).toEqual([{ strict: true, timeout: 5000, database: "x.db" }]);
    });

    it("preserves the SQLite retries option", () => {
      const args = buildAdapterArg("sqlite3", {
        adapter: "sqlite3",
        database: "x.db",
        retries: 3,
      });
      expect(args).toEqual([{ retries: 3, database: "x.db" }]);
    });

    it("forwards every configuration key to the adapter, as new_connection does", () => {
      const args = buildAdapterArg("sqlite3", {
        adapter: "sqlite3",
        database: "x.db",
        pool: 5,
        host: "ignored",
        strict: true,
        someKeyTheAdapterLearnsLater: "kept",
      });
      expect(args).toEqual([
        {
          pool: 5,
          host: "ignored",
          strict: true,
          someKeyTheAdapterLearnsLater: "kept",
          database: "x.db",
        },
      ]);
    });

    it("parses sqlite3:// URLs", () => {
      expect(
        buildAdapterArg("sqlite3", { adapter: "sqlite3", url: "sqlite3://memory.db" }),
      ).toEqual([{ database: "memory.db" }]);
    });

    it("defaults to :memory: when neither url nor database is set", () => {
      expect(buildAdapterArg("sqlite3", { adapter: "sqlite3" })).toEqual([
        { database: ":memory:" },
      ]);
    });

    it("prefers explicit database over url (matches non-sqlite precedence)", () => {
      expect(
        buildAdapterArg("sqlite3", {
          adapter: "sqlite3",
          url: "sqlite3://old.db",
          database: "mutated.db",
        }),
      ).toEqual([{ database: "mutated.db" }]);
    });

    it("uses the sqlite (filename, options) shape for node-sqlite", () => {
      expect(
        buildAdapterArg("node-sqlite", { adapter: "node-sqlite", database: "x.db", strict: true }),
      ).toEqual([{ strict: true, database: "x.db" }]);
    });
  });

  describe("postgresql / mysql2", () => {
    it("returns [url] when only a URL is given", () => {
      expect(
        buildAdapterArg("postgresql", { adapter: "postgresql", url: "postgres://h/db" }),
      ).toEqual(["postgres://h/db"]);
    });

    it("forwards URL plus adapter options under connectionString for postgresql", () => {
      const [config] = buildAdapterArg("postgresql", {
        adapter: "postgresql",
        url: "postgres://h/db",
        advisoryLocks: false,
      }) as [Record<string, unknown>];
      expect(config).toEqual({ connectionString: "postgres://h/db", advisoryLocks: false });
    });

    it("forwards URL plus adapter options under uri for mysql", () => {
      const [config] = buildAdapterArg("mysql2", {
        adapter: "mysql2",
        url: "mysql://h/db",
        advisoryLocks: false,
      }) as [Record<string, unknown>];
      expect(config).toEqual({ uri: "mysql://h/db", advisoryLocks: false });
    });

    it("forwards username under Rails' spelling when forwarding a URL with extra keys", () => {
      const [config] = buildAdapterArg("mysql2", {
        adapter: "mysql2",
        url: "mysql://h/db",
        username: "alice",
      }) as [Record<string, unknown>];
      expect(config).toEqual({ uri: "mysql://h/db", username: "alice" });
    });

    it("forwards both username and user when forwarding a URL", () => {
      const [config] = buildAdapterArg("postgresql", {
        adapter: "postgresql",
        url: "postgres://h/db",
        username: "alice",
        user: "bob",
      }) as [Record<string, unknown>];
      expect(config).toEqual({
        connectionString: "postgres://h/db",
        username: "alice",
        user: "bob",
      });
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
        username: "alice",
        host: "localhost",
        port: 3307,
      });
    });

    it("forwards socket untouched for mysql and omits host", () => {
      const [config] = buildAdapterArg("mysql2", {
        adapter: "mysql2",
        database: "db",
        socket: "/var/run/mysqld/mysqld.sock",
      }) as [Record<string, unknown>];
      expect(config.socket).toBe("/var/run/mysqld/mysqld.sock");
      expect(config.socketPath).toBeUndefined();
      expect(config.host).toBeUndefined();
    });

    it("treats empty socket as absent and falls back to localhost for mysql", () => {
      const [config] = buildAdapterArg("mysql2", {
        adapter: "mysql2",
        database: "db",
        socket: "",
      }) as [Record<string, unknown>];
      expect(config.host).toBe("localhost");
    });

    it("leaves an explicit socketPath alone for mysql", () => {
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
    expect(buildAdapterArg("sqlite3", { database: "file.db" })).toEqual([{ database: "file.db" }]);
    expect(buildAdapterArg("custom", { database: "db" })).toEqual([
      { database: "db", host: "localhost" },
    ]);
  });

  it("normalizes the node-sqlite adapter to the sqlite arg shape", () => {
    expect(buildAdapterArg("node-sqlite", { database: "file.db" })).toEqual([
      { database: "file.db" },
    ]);
  });
});

describe("parseSqliteUrl", () => {
  it("strips sqlite3:// and sqlite:// prefixes", () => {
    expect(buildAdapterArg("sqlite3", { url: "sqlite3://file.db" })).toEqual([
      { database: "file.db" },
    ]);
    expect(buildAdapterArg("sqlite3", { url: "sqlite://memory.db" })).toEqual([
      { database: "memory.db" },
    ]);
  });

  it("treats an empty path as :memory:", () => {
    expect(buildAdapterArg("sqlite3", { url: "sqlite3://" })).toEqual([{ database: ":memory:" }]);
  });

  it("passes bare paths through unchanged", () => {
    expect(buildAdapterArg("sqlite3", { database: "/tmp/x.db" })).toEqual([
      { database: "/tmp/x.db" },
    ]);
    expect(buildAdapterArg("sqlite3", { database: ":memory:" })).toEqual([
      { database: ":memory:" },
    ]);
  });
});

function argFamilyOf(name: string): string {
  const [byDatabase] = buildAdapterArg(name, { database: "db" }) as [Record<string, unknown>];
  if (!("host" in byDatabase)) return "sqlite";
  const [byUrl] = buildAdapterArg(name, { url: "u", pool: 5 }) as [Record<string, unknown>];
  if ("connectionString" in byUrl) return "postgresql";
  const [bySocket] = buildAdapterArg(name, { database: "db", socket: "/s" }) as [
    Record<string, unknown>,
  ];
  return bySocket.host === undefined ? "mysql" : "unclassified";
}

describe("ADAPTER_ARG_FAMILIES", () => {
  it("routes every classified adapter name to its driver-argument family", () => {
    const observed = Object.keys(ADAPTER_ARG_FAMILIES).map((name) => [name, argFamilyOf(name)]);
    expect(observed).toEqual(Object.entries(ADAPTER_ARG_FAMILIES));
  });

  it("leaves an unclassified adapter name on the generic object argument", () => {
    expect(argFamilyOf("trails_unclassified_adapter")).toBe("unclassified");
  });
});
