import { it, expect, describe, vi } from "vitest";
import { Time } from "@blazetrails/date";
import mysql from "mysql2/promise";
import { File, NameError } from "@blazetrails/ruby-compat";
import { Mysql2, type Client } from "../lib/index.js";

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
    const client = await clientOn({ execute });
    const binds = [
      new Number(3),
      Time.utc(2020, 1, 2, 3, 4, 5, 6),
      Temporal.PlainDate.from("2020-01-02"),
      "a",
      1n,
      null,
    ];
    await client.prepare("SELECT ?").execute(...binds);
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

  it("query merges its options over query_options, and _query casts with what it is handed", async () => {
    const native = vi.fn(async (_options: object) => [[], [{ name: "a" }]]);
    const client = await clientOn({ query: native });
    await client.query("SELECT 1", { databaseTimezone: "utc" });
    expect(client.queryOptions.databaseTimezone).toBe("local");
    const { typeCast } = native.mock.calls[0][0] as {
      typeCast(field: object, next: () => unknown): Time;
    };
    const time = typeCast({ type: "DATETIME", string: () => "2026-04-27 14:23:55" }, () => null);
    expect(time.getutc().hour).toBe(14);
  });

  type Cast = { typeCast(field: object, next: () => unknown): unknown };
  const castOf = (native: { mock: { calls: object[][] } }, call = 0): Cast["typeCast"] =>
    (native.mock.calls[call][0] as Cast).typeCast;

  it("_query answers a hash row keyed by field name, symbolize_keys or not", async () => {
    const native = vi.fn(async (_options: object) => [[{ a: 1 }], [{ name: "a" }]]);
    const client = await clientOn({ query: native });
    for (const symbolizeKeys of [false, true]) {
      const result = (await client.query("SELECT 1 AS a", { symbolizeKeys }))!;
      expect(result.fields).toEqual(["a"]);
      expect(result.toA()).toEqual([{ a: 1 }]);
    }
    expect(native.mock.calls[0][0]).toMatchObject({ rowsAsArray: false });
  });

  it("_query answers the raw string for every field when cast is false", async () => {
    const native = vi.fn(async (_options: object) => [[], [{ name: "a" }]]);
    const client = await clientOn({ query: native });
    await client.query("SELECT 1", { cast: false });
    const next = vi.fn(() => 1);
    const field = { type: "LONGLONG", string: () => "1" };
    expect(castOf(native)(field, next)).toBe("1");
    expect(castOf(native)({ type: "DATETIME", string: () => null }, next)).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("_query casts a TINYINT(1) and a BIT(1) to a boolean only under cast_booleans", async () => {
    const native = vi.fn(async (_options: object) => [[], [{ name: "a" }]]);
    const client = await clientOn({ query: native });
    await client.query("SELECT 1");
    await client.query("SELECT 1", { castBooleans: true });
    const tiny = (value: string | null, length = 1) => ({
      type: "TINY",
      length,
      string: () => value,
    });
    const bit = (value: number, length = 1) => ({
      type: "BIT",
      length,
      string: () => null,
      buffer: () => Uint8Array.of(value),
    });
    const next = () => "next";
    expect(castOf(native, 0)(tiny("1"), () => 1)).toBe(1);
    expect(castOf(native, 0)(bit(1), next)).toBe("next");
    expect(castOf(native, 1)(tiny("1"), next)).toBe(true);
    expect(castOf(native, 1)(tiny("0"), next)).toBe(false);
    expect(castOf(native, 1)(tiny(null), next)).toBeNull();
    expect(castOf(native, 1)(tiny("1", 4), () => 1)).toBe(1);
    expect(castOf(native, 1)(bit(1), next)).toBe(true);
    expect(castOf(native, 1)(bit(0), next)).toBe(false);
    expect(castOf(native, 1)(bit(1, 8), next)).toBe("next");
  });

  it("_query converts a time to application_timezone when one is named", async () => {
    const native = vi.fn(async (_options: object) => [[], [{ name: "a" }]]);
    const client = await clientOn({ query: native });
    const field = { type: "DATETIME", string: () => "2026-04-27 14:23:55" };
    await client.query("SELECT 1", { databaseTimezone: "utc" });
    await client.query("SELECT 1", { databaseTimezone: "utc", applicationTimezone: "local" });
    await client.query("SELECT 1", { databaseTimezone: "local", applicationTimezone: "utc" });
    const [unnamed, local, utc] = [0, 1, 2].map((call) => castOf(native, call)(field, () => null));
    expect((unnamed as Time).isUtc()).toBe(true);
    expect((local as Time).isUtc()).toBe(false);
    expect((local as Time).getutc().hour).toBe(14);
    expect((utc as Time).isUtc()).toBe(true);
    expect((utc as Time).getlocal().hour).toBe(14);
  });

  it("Statement#execute merges its keywords over query_options, and always casts", async () => {
    const execute = vi.fn(async (_options: object, _values: unknown[]) => [[[1]], [{ name: "a" }]]);
    const client = await clientOn({ execute });
    const stmt = client.prepare("SELECT ?");
    await stmt.execute(1);
    await stmt.execute(1, "x", { as: "array", cast: false, databaseTimezone: "utc" });
    expect(execute.mock.calls.map(([options, values]) => [options, values])).toMatchObject([
      [{ sql: "SELECT ?", rowsAsArray: false }, [1]],
      [{ sql: "SELECT ?", rowsAsArray: true }, [1, "x"]],
    ]);
    const time = castOf(execute, 1)(
      { type: "DATETIME", string: () => "2026-04-27 14:23:55" },
      () => null,
    ) as Time;
    expect(time.isUtc()).toBe(true);
    expect(client.queryOptions).toEqual(Mysql2.Client.defaultQueryOptions());

    await stmt.execute(1, Temporal.PlainDate.from("2020-01-02"));
    expect(execute.mock.calls[2]).toMatchObject([{ rowsAsArray: false }, [1, "2020-01-02"]]);
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
