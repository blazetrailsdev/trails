import { it, expect, describe, vi } from "vitest";
import { Time } from "@blazetrails/date";
import mysqlCore from "mysql2";
import mysql from "mysql2/promise";
import { File, NameError, stderr } from "@blazetrails/ruby-compat";
import { Mysql2, type Client, type Result } from "../lib/index.js";

async function clientOn(connection: object): Promise<Client> {
  const createConnection = vi
    .spyOn(mysql, "createConnection")
    .mockResolvedValue(connection as never);
  try {
    return await Mysql2.Client.new({});
  } finally {
    createConnection.mockRestore();
  }
}

describe("mysql2Client", () => {
  it("automatic_close = false unrefs and strips listeners, and never closes the socket", async () => {
    const stream = { unref: vi.fn(), removeAllListeners: vi.fn(), end: vi.fn(), destroy: vi.fn() };
    const client = await clientOn({ connection: { stream } });
    expect(client.automaticClose).toBe(true);
    client.automaticClose = false;
    expect(client.automaticClose).toBe(false);
    expect(stream.removeAllListeners).toHaveBeenCalledOnce();
    expect(stream.unref).toHaveBeenCalledOnce();
    expect(stream.end).not.toHaveBeenCalled();
    expect(stream.destroy).not.toHaveBeenCalled();
  });

  it("automatic_close = true leaves the socket alone", async () => {
    const stream = { unref: vi.fn(), removeAllListeners: vi.fn() };
    const client = await clientOn({ connection: { stream } });
    client.automaticClose = true;
    expect(stream.unref).not.toHaveBeenCalled();
  });

  it("answers for a client with no socket", async () => {
    const client = await clientOn({});
    expect(() => (client.automaticClose = false)).not.toThrow();
  });

  it("execute unboxes a Float carrier and formats temporals, and leaves the rest alone", async () => {
    const execute = vi.fn(async () => [{ affectedRows: 0 }, undefined]);
    const prepare = vi.fn(async () => ({ statement: { columns: [], parameters: [] } }));
    const client = await clientOn({ execute, prepare });
    const binds = [
      new Number(3),
      Time.utc(2020, 1, 2, 3, 4, 5, 6),
      Temporal.PlainDate.from("2020-01-02"),
      "a",
      1n,
      null,
    ];
    await (await client.prepare("SELECT ?")).execute(...binds);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: "SELECT ?" }), [
      3,
      "2020-01-02 03:04:05.000006",
      "2020-01-02",
      "a",
      1n,
      null,
    ]);
  });

  it("Mysql2.Error is an error the client raised, not any error with a code", async () => {
    const raised = Object.assign(new Error("gone"), { code: "ER_X" });
    const client = await clientOn({ query: () => Promise.reject(raised) });
    const error = await client.query("").catch((e: unknown) => e);
    expect(error).toBe(raised);
    expect(raised instanceof Mysql2.Error).toBe(false);
    expect(Object.assign(new Error(), { code: "ENOENT" }) instanceof Mysql2.Error).toBe(false);
  });
});

describe("Mysql2::Client error boundary", () => {
  it("raises TimeoutError and ConnectionError for the driver's timeout and connection codes", async () => {
    const timeout = Object.assign(new Error("t"), { code: "PROTOCOL_SEQUENCE_TIMEOUT" });
    const lost = Object.assign(new Error("l"), { code: "PROTOCOL_CONNECTION_LOST" });
    const client = await clientOn({
      query: vi
        .fn()
        .mockRejectedValueOnce(timeout)
        .mockRejectedValueOnce(lost)
        .mockRejectedValueOnce(timeout),
    });
    client.readTimeout = 5;
    const t = await client.query("").catch((e: unknown) => e);
    expect(t).toBeInstanceOf(Mysql2.Error.TimeoutError);
    expect((t as InstanceType<typeof Mysql2.Error>).errorNumber).toBeNull();
    const l = await client.query("").catch((e: unknown) => e);
    expect(l).toBeInstanceOf(Mysql2.Error.ConnectionError);
    expect((l as InstanceType<typeof Mysql2.Error>).errorNumber).toBe(2013);
    expect((t as Error).message).toBe(
      "Timeout waiting for a response from the last query. (waited 5 seconds)",
    );
    client.readTimeout = null;
    expect(await client.query("").catch((e: unknown) => e)).toBeInstanceOf(
      Mysql2.Error.ConnectionError,
    );
  });
});

describe("Mysql2::Client#warning_count", () => {
  it("is the count the last EOF or OK packet carried", async () => {
    const handlePacket = vi.fn();
    const query = vi.fn(async () => [{ affectedRows: 1, warningStatus: 2 }, undefined]);
    const client = await clientOn({ connection: { handlePacket }, query });
    expect(client.warningCount).toBe(0);

    const eof = Buffer.from([0xfe, 3, 0, 2, 0]);
    const packet = {
      offset: 0,
      end: eof.length,
      isEOF: () => true,
      eofWarningCount: () => eof.readInt16LE(1),
    };
    (
      client as unknown as { connection: { connection: { handlePacket(p: object): void } } }
    ).connection.connection.handlePacket(packet);
    expect(handlePacket).toHaveBeenCalledWith(packet);
    expect(client.warningCount).toBe(3);

    await client.query("UPDATE t SET a = 1");
    expect(client.warningCount).toBe(2);
  });

  type Column = [name: string, type: string & keyof typeof mysql.Types, length?: number];
  const rowOf = (columns: Column[], ...values: Array<string | Uint8Array | null>) => [
    [Object.fromEntries(columns.map(([name], i) => [name, cell(values[i])]))],
    columns.map(([name, type, columnLength]) => ({
      name,
      type: mysql.Types[type],
      columnLength,
      characterSet: ["BIT", "NEWDECIMAL"].includes(type)
        ? mysql.Charsets.BINARY
        : mysql.Charsets.UTF8MB4_GENERAL_CI,
      encoding: ["BIT", "NEWDECIMAL"].includes(type) ? "binary" : "utf8",
    })),
  ];
  const cell = (value: string | Uint8Array | null | undefined) =>
    value == null ? null : typeof value === "string" ? value : String.fromCharCode(...value);

  it("query merges its options over query_options, and _query casts with what it is handed", async () => {
    const native = vi.fn(async (_options: object) =>
      rowOf([["a", "DATETIME"]], "2026-04-27 14:23:55"),
    );
    const client = await clientOn({ query: native });
    const result = (await client.query("SELECT 1", { databaseTimezone: "utc" }))!;
    expect(client.queryOptions.databaseTimezone).toBe("local");
    const time = (result.toA()[0] as Record<string, Time>)["a"];
    expect(time.getutc().hour).toBe(14);
  });

  it("_query answers a hash row keyed by field name, symbolize_keys or not", async () => {
    const native = vi.fn(async (_options: object) => rowOf([["a", "LONG"]], "1"));
    const client = await clientOn({ query: native });
    for (const symbolizeKeys of [false, true]) {
      const result = (await client.query("SELECT 1 AS a", { symbolizeKeys }))!;
      expect(result.fields).toEqual(["a"]);
      expect(result.toA()).toEqual([{ a: 1 }]);
    }
    expect(native.mock.calls[0][0]).toMatchObject({ rowsAsArray: false });
  });

  it("_query answers the raw string for every field when cast is false", async () => {
    const native = vi.fn(async (_options: object) =>
      rowOf(
        [
          ["a", "LONGLONG"],
          ["b", "DATETIME"],
        ],
        "1",
        null,
      ),
    );
    const client = await clientOn({ query: native });
    const result = (await client.query("SELECT 1", { cast: false }))!;
    expect(result.toA()).toEqual([{ a: "1", b: null }]);
  });

  it("_query casts a TINYINT(1) and a BIT(1) to a boolean only under cast_booleans", async () => {
    const columns: Column[] = [
      ["t1", "TINY", 1],
      ["t0", "TINY", 1],
      ["tn", "TINY", 1],
      ["t4", "TINY", 4],
      ["b1", "BIT", 1],
      ["b0", "BIT", 1],
      ["b8", "BIT", 8],
    ];
    const values = ["1", "0", null, "1", Uint8Array.of(1), Uint8Array.of(0), Uint8Array.of(1)];
    const native = vi.fn(async (_options: object) => rowOf(columns, ...values));
    const client = await clientOn({ query: native });
    const plain = (await client.query("SELECT 1"))!.toA()[0];
    const cast = (await client.query("SELECT 1", { castBooleans: true }))!.toA()[0];
    expect(plain).toMatchObject({ t1: 1, t0: 0, tn: null, t4: 1 });
    expect((plain as Record<string, unknown>)["b1"]).toEqual(Buffer.of(1));
    expect(cast).toMatchObject({ t1: true, t0: false, tn: null, t4: 1, b1: true, b0: false });
    expect((cast as Record<string, unknown>)["b8"]).toEqual(Buffer.of(1));
  });

  it("_query converts a time to application_timezone when one is named", async () => {
    const native = vi.fn(async (_options: object) =>
      rowOf([["a", "DATETIME"]], "2026-04-27 14:23:55"),
    );
    const client = await clientOn({ query: native });
    const read = async (options: Parameters<Client["query"]>[1]) =>
      ((await client.query("SELECT 1", options))!.toA()[0] as Record<string, Time>)["a"];
    const unnamed = await read({ databaseTimezone: "utc" });
    const local = await read({ databaseTimezone: "utc", applicationTimezone: "local" });
    const utc = await read({ databaseTimezone: "local", applicationTimezone: "utc" });
    expect(unnamed.isUtc()).toBe(true);
    expect(local.isUtc()).toBe(false);
    expect(local.getutc().hour).toBe(14);
    expect(utc.isUtc()).toBe(true);
    expect(utc.getlocal().hour).toBe(14);
  });

  it("Result#each casts with the options it is given, over the query's", async () => {
    const native = vi.fn(async (_options: object) =>
      rowOf(
        [
          ["a", "TINY", 1],
          ["b", "DATETIME"],
        ],
        "1",
        "2026-04-27 14:23:55",
      ),
    );
    const client = await clientOn({ query: native });
    const uncast = (await client.query("SELECT 1"))!;
    expect(uncast.each({ cast: false })).toEqual([{ a: "1", b: "2026-04-27 14:23:55" }]);
    expect(uncast.each()).toEqual([{ a: "1", b: "2026-04-27 14:23:55" }]);
    const booleans = (await client.query("SELECT 1"))!;
    expect((booleans.each({ castBooleans: true })[0] as Record<string, unknown>)["a"]).toBe(true);
    const zoned = (await client.query("SELECT 1", { databaseTimezone: "local" }))!;
    const [row] = zoned.each({ databaseTimezone: "utc", applicationTimezone: "local" });
    const b = (row as Record<string, Time>)["b"];
    expect(b.isUtc()).toBe(false);
    expect(b.getutc().hour).toBe(14);
  });

  it("_query reads a binary-charset NEWDECIMAL, as SUM answers, as a number", async () => {
    const native = vi.fn(async (_options: object) => rowOf([["s", "NEWDECIMAL"]], "318"));
    const client = await clientOn({ query: native });
    expect((await client.query("SELECT SUM(1)"))!.toA()).toEqual([{ s: 318 }]);
  });

  it("Result#each casts again on each call when cache_rows is false", async () => {
    const native = vi.fn(async (_options: object) => rowOf([["a", "TINY", 1]], "1"));
    const client = await clientOn({ query: native });
    const result = (await client.query("SELECT 1", { cacheRows: false }))!;
    expect(result.each({ castBooleans: true })).toEqual([{ a: true }]);
    expect(result.each({ cast: false })).toEqual([{ a: "1" }]);
    const cached = (await client.query("SELECT 1"))!;
    expect(cached.each({ castBooleans: true })).toEqual([{ a: true }]);
    expect(cached.each({ cast: false })).toEqual([{ a: true }]);
  });

  it("Statement#execute merges its keywords over query_options, and always casts", async () => {
    const execute = vi.fn(async (_options: object, _values: unknown[]) => [[[1]], [{ name: "a" }]]);
    const prepare = vi.fn(async () => ({ statement: { columns: [], parameters: [{}] } }));
    const client = await clientOn({ execute, prepare });
    const stmt = await client.prepare("SELECT ?");
    await stmt.execute(1);
    await stmt.execute(1, "x", { as: "array", cast: false, databaseTimezone: "utc" });
    expect(execute.mock.calls.map(([options, values]) => [options, values])).toMatchObject([
      [{ sql: "SELECT ?", rowsAsArray: false }, [1]],
      [{ sql: "SELECT ?", rowsAsArray: true }, [1, "x"]],
    ]);
    expect(client.queryOptions).toEqual(Mysql2.Client.defaultQueryOptions());

    await stmt.execute(1, Temporal.PlainDate.from("2020-01-02"));
    expect(execute.mock.calls[2]).toMatchObject([{ rowsAsArray: false }, [1, "2020-01-02"]]);
  });

  it("a Statement#execute result reads its cast options per #each call", async () => {
    const fields = [
      { name: "t", type: mysql.Types.DATETIME, encoding: "binary" },
      { name: "b", type: mysql.Types.TINY, columnLength: 1, encoding: "binary" },
    ];
    const execute = vi.fn(async () => [[{ t: "2026-04-27 14:23:55", b: "1" }], fields]);
    const prepare = vi.fn(async () => ({ statement: { columns: fields, parameters: [] } }));
    const client = await clientOn({ execute, prepare });
    const stmt = await client.prepare("SELECT 1");
    const rowOf = async (opts: Parameters<Result["each"]>[0]) =>
      (await stmt.execute())!.each(opts)[0] as { t: Time; b: unknown };
    expect((await rowOf({ databaseTimezone: "utc" })).t.isUtc()).toBe(true);
    expect((await rowOf({ databaseTimezone: "local" })).t.isUtc()).toBe(false);
    expect((await rowOf({ databaseTimezone: "local", applicationTimezone: "utc" })).t.isUtc()).toBe(
      true,
    );
    expect((await rowOf({ castBooleans: true })).b).toBe(true);
    expect((await rowOf({})).b).toBe(1);

    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    try {
      const row = await rowOf({ cast: false, cacheRows: false });
      expect(row.t).toBeInstanceOf(Time);
      expect(write.mock.calls.map(([m]) => String(m)).join("")).toMatch(
        /:cache_rows is forced for prepared statements \(if not streaming\)\n:cast is forced for prepared statements/,
      );
    } finally {
      write.mockRestore();
    }
  });

  it("default_query_options is one shared Hash each client dups", async () => {
    expect(Mysql2.Client.defaultQueryOptions()).toBe(Mysql2.Client.defaultQueryOptions());
    const { queryOptions } = await clientOn({});
    expect(queryOptions).toEqual(Mysql2.Client.defaultQueryOptions());
    expect(queryOptions).not.toBe(Mysql2.Client.defaultQueryOptions());
  });
});

describe("Mysql2::Client#initialize", () => {
  const { connectFlags } = Mysql2.Client.defaultQueryOptions() as { connectFlags: number };
  const DRIVER_DEFAULTS = [
    ...["LONG_PASSWORD", "FOUND_ROWS", "LONG_FLAG", "CONNECT_WITH_DB", "ODBC", "LOCAL_FILES"],
    ...["IGNORE_SPACE", "PROTOCOL_41", "IGNORE_SIGPIPE", "TRANSACTIONS", "RESERVED"],
    ...["SECURE_CONNECTION", "MULTI_RESULTS", "SESSION_TRACK", "CONNECT_ATTRS", "PLUGIN_AUTH"],
    "PLUGIN_AUTH_LENENC_CLIENT_DATA",
  ];

  async function driverConfig(
    opts: object,
  ): Promise<{ flags: string[] } & Record<string, unknown>> {
    const createConnection = vi.spyOn(mysql, "createConnection").mockRejectedValue(new Error("x"));
    try {
      await Mysql2.Client.new(opts).catch(() => {});
      return createConnection.mock.calls[0][0] as never;
    } finally {
      createConnection.mockRestore();
    }
  }

  it.each([
    ["an Integer", 0x2 | 0x10000, ["FOUND_ROWS", "MULTI_STATEMENTS", "-IGNORE_SPACE"]],
    ["an Array", ["FOUND_ROWS", "-LOCAL_FILES"], ["FOUND_ROWS", "-IGNORE_SPACE"]],
    ["an Array naming IGNORE_SPACE", ["IGNORE_SPACE"], ["IGNORE_SPACE"]],
    ["a String", "MULTI_STATEMENTS -LONG_FLAG", ["MULTI_STATEMENTS", "-IGNORE_SPACE"]],
    ["an absent", undefined, ["-IGNORE_SPACE"]],
  ])(
    "hands the driver %s flags as names, and the server sees what it saw",
    async (_n, flags, was) => {
      const config = await driverConfig({ host: "db", flags });
      expect(config.flags).toEqual(expect.arrayContaining(was));
      const added = config.flags.filter((name) => !was.includes(name));
      expect(added.filter((name) => !DRIVER_DEFAULTS.includes(name))).toEqual([]);
      expect(config.flags).not.toContain("REMEMBER_OPTIONS");
      expect(config.flags.includes("LONG_FLAG")).toBe(flags !== "MULTI_STATEMENTS -LONG_FLAG");
    },
  );

  it("turns on the driver's compress option for a COMPRESS flag", async () => {
    expect((await driverConfig({ host: "db", flags: ["COMPRESS"] })).compress).toBe(true);
    expect((await driverConfig({ host: "db" })).compress).toBeUndefined();
  });

  it("parse_flags_array adds a named flag, clears a negated one, and warns of an unknown one", async () => {
    const client = await clientOn({});
    expect(client.parseFlagsArray(["FOUND_ROWS"], connectFlags)).toBe(connectFlags | 0x2);
    expect(client.parseFlagsArray(["-LONG_FLAG"], connectFlags)).toBe(connectFlags & ~0x4);
    expect(client.parseFlagsArray(["NOPE", "-NOPE"], connectFlags)).toBe(connectFlags);
    expect(client.parseFlagsArray(["FOUND_ROWS"])).toBe(0x2);
  });

  it("reads an absent keyword as no key, and a timeout through Integer()", async () => {
    const config = await driverConfig({ host: "db", connectTimeout: undefined });
    expect(config.connectTimeout).toBe(120_000);
    await expect(Mysql2.Client.new({ host: "db", readTimeout: "abc" })).rejects.toThrow(
      'invalid value for Integer(): "abc"',
    );
    expect((await clientOn({})).parseFlagsArray(["toString", "-constructor"], 0)).toBe(0);
  });

  it("raises Mysql2::Error unless the options are a Hash", async () => {
    await expect(Mysql2.Client.new([] as never)).rejects.toThrow(
      "Options parameter must be a Hash",
    );
    await expect(Mysql2.Client.new([] as never)).rejects.toBeInstanceOf(Mysql2.Error);
  });

  it("passes the gem's connect arguments and merges the options into query_options", async () => {
    const config = await driverConfig({
      username: "rails",
      user: "driver",
      password: 1,
      host: "db",
      port: "3307",
      database: "d",
      socket: "/tmp/s",
      readTimeout: "5",
      strict: true,
    });
    expect(config).toMatchObject({
      user: "rails",
      password: "1",
      host: "db",
      port: 3307,
      database: "d",
      socketPath: "/tmp/s",
      connectTimeout: 120_000,
      supportBigNumbers: true,
    });
    expect(config.connectAttributes).toHaveProperty("program_name");
    expect(config).not.toHaveProperty("strict");
    expect(config).not.toHaveProperty("readTimeout");
  });
});

describe("Mysql2::Error", () => {
  it("new_with_args builds the class CODES names for the error number, else Error", () => {
    const denied = Mysql2.Error.newWithArgs("denied", 80000, 1045, "28000");
    expect(denied).toBeInstanceOf(Mysql2.Error.ConnectionError);
    expect([denied.errorNumber, denied.errno, denied.sqlState]).toEqual([1045, 1045, "28000"]);
    expect([denied.message, denied.error]).toEqual(["denied", "denied"]);
    expect(Mysql2.Error.newWithArgs("lock", null, 1205, null)).toBeInstanceOf(
      Mysql2.Error.TimeoutError,
    );
    const plain = Mysql2.Error.newWithArgs("dup", null, 1062, "23000");
    expect(plain.constructor).toBe(Mysql2.Error);
    expect(plain).not.toBeInstanceOf(Mysql2.Error.ConnectionError);
  });

  it("is what the client raises for an error the server numbered", async () => {
    const raised = Object.assign(new Error("Table 'x' doesn't exist"), {
      code: "ER_NO_SUCH_TABLE",
      errno: 1146,
      sqlState: "42S02",
    });
    const client = await clientOn({ query: () => Promise.reject(raised) });
    const error = await client.query("SELECT 1").catch((e: unknown) => e);
    expect((error as object).constructor).toBe(Mysql2.Error);
    expect(error).toMatchObject({ errorNumber: 1146, sqlState: "42S02", message: raised.message });
    expect((error as Error).cause).toBe(raised);

    const connection = { _handshakePacket: { serverVersion: "5.5.5-10.11.6-MariaDB" } };
    const maria = await clientOn({ connection, query: () => Promise.reject(raised) });
    const versioned = await maria.query("SELECT 1").catch((e: unknown) => e);
    expect((versioned as { serverVersion: number }).serverVersion).toBe(101106);
  });
});

describe("Mysql2::Client#initialize option writers", () => {
  async function configFor(opts: object): Promise<{ config: Record<string, unknown> }> {
    const query = vi.fn(async () => [[], []]);
    const createConnection = vi
      .spyOn(mysql, "createConnection")
      .mockResolvedValue({ query } as never);
    try {
      await Mysql2.Client.new(opts);
      return { config: createConnection.mock.calls[0][0] as Record<string, unknown> };
    } finally {
      createConnection.mockRestore();
    }
  }

  it("maps :local_infile onto the LOCAL_FILES flag and :secure_auth onto insecureAuth", async () => {
    expect((await configFor({ localInfile: true })).config.flags).toContain("LOCAL_FILES");
    expect((await configFor({ localInfile: false })).config.flags).not.toContain("LOCAL_FILES");
    expect((await configFor({ secureAuth: false })).config.insecureAuth).toBe(true);
  });

  it("maps :ssl_mode and :sslcipher onto the ssl option", async () => {
    expect((await configFor({})).config.ssl).toBeUndefined();
    expect((await configFor({})).config.charset).toBe("utf8");
    expect((await configFor({ sslMode: "required", sslcipher: "AES" })).config.ssl).toEqual({
      rejectUnauthorized: false,
      ciphers: "AES",
    });
    expect((await configFor({ sslverify: true })).config.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("parses ssl_mode with or without the SSL_MODE_ prefix", async () => {
    const client = await clientOn({});
    expect(client.parseSslMode("verify_ca")).toBe(Mysql2.Client.SSL_MODE_VERIFY_CA);
    expect(client.parseSslMode("SSL_MODE_DISABLED")).toBe(Mysql2.Client.SSL_MODE_DISABLED);
    expect(client.parseSslMode("bogus")).toBeUndefined();
  });

  it("parse_ssl_mode raises NameError for a name that is not a constant name", async () => {
    const client = await clientOn({});
    expect(() => client.parseSslMode("verify ca")).toThrow(NameError);
    expect(() => client.parseSslMode("verify ca")).toThrow(
      "wrong constant name SSL_MODE_VERIFY CA",
    );
    expect(() => client.parseSslMode("SSL_MODE_x y")).toThrow("wrong constant name SSL_MODE_X Y");
  });

  it("feeds find_default_ca_path to ssl_set as sslca for VERIFY_CA and VERIFY_IDENTITY", async () => {
    const ca = new URL("./fixtures/my.cnf", import.meta.url).pathname;
    const find = vi.spyOn(Mysql2.Client.prototype, "findDefaultCaPath").mockReturnValue(ca);
    try {
      const contents = await File.readAsync(ca);
      expect((await configFor({ sslMode: "verify_ca" })).config.ssl).toMatchObject({
        ca: contents,
      });
      expect((await configFor({ sslMode: "verify_identity" })).config.ssl).toMatchObject({
        ca: contents,
      });
      expect(
        ((await configFor({ sslMode: "required" })).config.ssl as Record<string, unknown>).ca,
      ).toBeUndefined();
    } finally {
      find.mockRestore();
    }
  });

  it("reads :default_file's [client] and :default_group sections under the explicit options", async () => {
    const defaultFile = new URL("./fixtures/my.cnf", import.meta.url).pathname;
    const { config } = await configFor({ defaultFile, defaultGroup: "trails", host: "explicit" });
    expect(config).toMatchObject({
      user: "cnfuser",
      port: 3307,
      host: "explicit",
      database: "cnfdb",
    });
    expect(config.socketPath).toBeUndefined();
    expect((await configFor({ defaultFile })).config.database).toBeUndefined();
  });

  it(":default_file reads every client option over mysql_options, dashed or underscored, and follows !include", async () => {
    const keyFile = new URL("./fixtures/my.cnf", import.meta.url).pathname;
    const key = await File.readAsync(keyFile);
    const defaultFile = new URL("./fixtures/my-ssl.tmp.cnf", import.meta.url).pathname;
    await File.writeAsync(defaultFile, `[client]\nssl_key = ${keyFile}\n!include my-full.cnf\n`);
    let config: Record<string, unknown>;
    try {
      ({ config } = await configFor({ defaultFile, encoding: "latin1" }));
    } finally {
      await File.deleteAsync(defaultFile);
    }
    expect(config).toMatchObject({
      charset: "utf8mb4",
      connectTimeout: 7000,
      compress: true,
      user: "cnfuser",
      port: 3307,
      ssl: { key, ciphers: "AES128-SHA" },
    });
  });

  it(":default_file's ssl options are ignored under ssl_mode DISABLED", async () => {
    const defaultFile = new URL("./fixtures/my-full.cnf", import.meta.url).pathname;
    expect((await configFor({ defaultFile, sslMode: "disabled" })).config.ssl).toBeUndefined();
  });

  it("Statement#close closes its prepared handle exactly once, cached or not", async () => {
    const cached = { columns: [], parameters: [], close: vi.fn() };
    const uncached = { columns: [], parameters: [], close: vi.fn() };
    let handle = cached;
    const unprepare = vi.fn(() => {
      if (handle !== cached) return undefined;
      cached.close();
      return cached;
    });
    const prepare = vi.fn(async () => ({ statement: handle }));
    const client = await clientOn({ prepare, unprepare });
    (await client.prepare("SELECT 1")).close();
    expect(cached.close).toHaveBeenCalledOnce();
    handle = uncached;
    (await client.prepare("SELECT 2")).close();
    expect(uncached.close).toHaveBeenCalledOnce();
  });

  it(":write_timeout fails a write that has not drained with CR_SERVER_LOST", async () => {
    vi.useFakeTimers();
    try {
      const destroy = vi.fn();
      const write = vi.fn((_chunk: unknown, _cb?: () => void) => true);
      const stream = { write, destroy };
      const client = await (async () => {
        const createConnection = vi
          .spyOn(mysql, "createConnection")
          .mockResolvedValue({ connection: { stream } } as never);
        try {
          return await Mysql2.Client.new({ writeTimeout: 2 });
        } finally {
          createConnection.mockRestore();
        }
      })();
      const drained = vi.fn();
      stream.write("a", drained);
      write.mock.calls[0][1]!();
      expect(drained).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(2000);
      expect(destroy).not.toHaveBeenCalled();
      stream.write("b");
      vi.advanceTimersByTime(2000);
      expect(destroy).toHaveBeenCalledWith(
        expect.objectContaining({ code: "PROTOCOL_CONNECTION_LOST" }),
      );
      expect(() => client.raiseMysql2Error(destroy.mock.calls[0][0])).toThrow(
        expect.objectContaining({ errorNumber: 2013 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses the mysql_clear_password plugin unless :enable_cleartext_plugin", async () => {
    const plugins = (await configFor({})).config.authPlugins as Record<string, () => () => never>;
    expect(() => plugins.mysql_clear_password()()).toThrow(Mysql2.Error);
    expect(() => plugins.mysql_clear_password()()).toThrow("plugin not enabled");
    expect((await configFor({ enableCleartextPlugin: true })).config.authPlugins).toBeUndefined();
  });

  it("tries TLS for :ssl_mode PREFERRED and retries in plaintext when the server has none", async () => {
    const seen: unknown[] = [];
    const createConnection = vi
      .spyOn(mysql, "createConnection")
      .mockImplementationOnce(async (config) => {
        seen.push((config as Record<string, unknown>).ssl);
        throw Object.assign(new Error("no ssl"), { code: "HANDSHAKE_NO_SSL_SUPPORT" });
      })
      .mockImplementationOnce(async (config) => {
        seen.push((config as Record<string, unknown>).ssl);
        return {} as never;
      });
    try {
      await Mysql2.Client.new({ sslMode: "preferred" });
    } finally {
      createConnection.mockRestore();
    }
    expect(seen).toEqual([{ rejectUnauthorized: false }, undefined]);
  });

  it("reconnects before a query on a closed connection when :reconnect", async () => {
    const query = vi.fn(async () => [[{ "1": 1 }], [{ name: "1" }]]);
    const connection = { query, connection: { stream: { destroyed: true } } };
    const createConnection = vi
      .spyOn(mysql, "createConnection")
      .mockResolvedValue(connection as never);
    try {
      await (await Mysql2.Client.new({ reconnect: true })).query("SELECT 1");
      expect(createConnection).toHaveBeenCalledTimes(2);
      await (await Mysql2.Client.new({})).query("SELECT 1");
      expect(createConnection).toHaveBeenCalledTimes(3);
    } finally {
      createConnection.mockRestore();
    }
  });
});

describe("Mysql2::Client default_auth", () => {
  it("answers the server's handshake with the default_auth plugin", async () => {
    const seen: string[] = [];
    const handshake = {
      handshake: { authPluginName: "caching_sha2_password" },
      sendCredentials(this: { handshake: { authPluginName: string } }) {
        seen.push(this.handshake.authPluginName);
      },
    };
    const listeners: Record<string, () => void> = {};
    const core = {
      _command: handshake,
      once: (event: string, fn: () => void) => (listeners[event] = fn),
      off: (event: string) => delete listeners[event],
      promise: () => ({}),
    };
    const createConnection = vi.spyOn(mysqlCore, "createConnection").mockReturnValue(core as never);
    try {
      const client = Mysql2.Client.new({ defaultAuth: "mysql_native_password" });
      await vi.waitFor(() => expect(createConnection).toHaveBeenCalled());
      handshake.sendCredentials();
      const connect = listeners["connect"];
      delete listeners["connect"];
      connect();
      await client;
    } finally {
      createConnection.mockRestore();
    }
    expect(seen).toEqual(["mysql_native_password"]);
    expect(listeners).toEqual({});
  });

  it("finds the driver's ClientHandshake as the connection's first command", () => {
    const core = mysqlCore.createConnection({ host: "127.0.0.1", port: 1 });
    core.on("error", () => {});
    const handshake = (core as unknown as { _command: { constructor: { name: string } } })._command;
    expect(handshake.constructor.name).toBe("ClientHandshake");
    expect(typeof (handshake as unknown as { sendCredentials: unknown }).sendCredentials).toBe(
      "function",
    );
    core.destroy();
  });
});
