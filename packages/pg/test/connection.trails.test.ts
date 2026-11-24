import { describe, expect, it, vi } from "vitest";

describe("PG.connect", () => {
  it("raises LoadError when the pg npm package cannot be resolved", async () => {
    vi.resetModules();
    vi.doMock("pg", () => {
      throw Object.assign(new Error("Cannot find package 'pg'"), { code: "ERR_MODULE_NOT_FOUND" });
    });
    try {
      const { PG } = await import("../lib/index.js");
      const { LoadError } = await import("@blazetrails/ruby-compat");
      const error = await PG.connect({}).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LoadError);
      expect((error as InstanceType<typeof LoadError>).message).toBe("cannot load such file -- pg");
    } finally {
      vi.doUnmock("pg");
      vi.resetModules();
    }
  });
});

describe("PG::Connection escaping", () => {
  async function pg() {
    const { PG } = await import("../lib/index.js");
    return PG;
  }

  function conn(PG: Awaited<ReturnType<typeof pg>>, standardConformingStrings = "on") {
    return Object.assign(Object.create(PG.Connection.prototype), {
      parameterStatuses: { standard_conforming_strings: standardConformingStrings },
    }) as import("../lib/connection.js").Connection;
  }

  it("escape_bytea matches PQescapeBytea without a connection", async () => {
    const PG = await pg();
    expect(PG.Connection.escapeBytea("")).toBe("");
    expect(PG.Connection.escapeBytea(Uint8Array.of(0x00))).toBe("\\\\000");
    expect(PG.Connection.escapeBytea(Uint8Array.of(0x5c))).toBe("\\\\\\\\");
    expect(PG.Connection.escapeBytea(Uint8Array.of(0xff))).toBe("\\\\377");
  });

  it("escape_bytea matches PQescapeByteaConn on a connection", async () => {
    const PG = await pg();
    const c = conn(PG);
    expect(c.escapeBytea("")).toBe("\\x");
    expect(c.escapeBytea(Uint8Array.of(0x00))).toBe("\\x00");
    expect(c.escapeBytea(Uint8Array.of(0x5c))).toBe("\\x5c");
    expect(c.escapeBytea(Uint8Array.of(0xff))).toBe("\\xff");
    expect(conn(PG, "off").escapeBytea(Uint8Array.of(0xff))).toBe("\\\\xff");
    expect(c.unescapeBytea(c.escapeBytea("a\\\u0000"))).toEqual(Uint8Array.of(0x61, 0x5c, 0x00));
  });

  it("escape_string doubles backslashes only without standard_conforming_strings", async () => {
    const PG = await pg();
    expect(PG.Connection.escapeString("a\\b'c")).toBe("a\\\\b''c");
    expect(PG.Connection.escape).toBe(PG.Connection.escapeString);
    expect(conn(PG).escape("a\\b'c")).toBe("a\\b''c");
    expect(conn(PG, "off").escapeString("a\\b'c")).toBe("a\\\\b''c");
  });

  it("quote_ident quotes a string or an Array and raises on a null byte", async () => {
    const PG = await pg();
    const { ArgumentError } = await import("@blazetrails/ruby-compat");
    expect(PG.Connection.quoteIdent('b"c')).toBe('"b""c"');
    expect(PG.Connection.quoteIdent(["a", 'b"c'])).toBe('"a"."b""c"');
    expect(conn(PG).quoteIdent("t")).toBe('"t"');
    expect(() => PG.Connection.quoteIdent("a\u0000b")).toThrow(ArgumentError);
    expect(() => PG.Connection.quoteIdent("a\u0000b")).toThrow("string contains null byte");
  });

  it("unescape_bytea is one body for both forms", async () => {
    const PG = await pg();
    expect(PG.Connection.unescapeBytea("\\x6869")).toEqual(new TextEncoder().encode("hi"));
    expect(conn(PG).unescapeBytea("a\\134\\000b")).toEqual(Uint8Array.of(0x61, 0x5c, 0x00, 0x62));
  });
});

describe("PG::Connection connect primitives", () => {
  async function pg() {
    const { PG } = await import("../lib/index.js");
    return PG;
  }

  it("parses key=value and URI conninfo strings into camelCase keywords", async () => {
    const PG = await pg();
    const kv = Object.fromEntries(
      PG.Connection.conninfoParse("host=a port='5 4' connect_timeout=3")
        .filter((h) => h.val != null)
        .map((h) => [h.keyword, h.val]),
    );
    expect(kv).toEqual({ host: "a", port: "5 4", connectTimeout: "3" });
    const uri = Object.fromEntries(
      PG.Connection.conninfoParse("postgresql://u:p@h1:1,h2:2/db?sslmode=require")
        .filter((h) => h.val != null)
        .map((h) => [h.keyword, h.val]),
    );
    expect(uri).toEqual({
      user: "u",
      password: "p",
      host: "h1,h2",
      port: "1,2",
      dbname: "db",
      sslmode: "require",
    });
    expect(() => PG.Connection.conninfoParse("bogus=1")).toThrow(
      'invalid connection option "bogus"',
    );
  });

  it("builds a conninfo string from positional and hash arguments", async () => {
    const PG = await pg();
    expect(
      PG.Connection.parseConnectArgs("h", 5432, null, null, "db", { fallbackApplicationName: "x" }),
    ).toBe("host='h' port='5432' dbname='db' fallback_application_name='x'");
    expect(PG.Connection.quoteConnstr("a'b\\c")).toBe("'a\\'b\\\\c'");
  });

  it("reports compiled conndefaults", async () => {
    const PG = await pg();
    expect(PG.Connection.conndefaultsHash().port).toBe("5432");
  });
});
