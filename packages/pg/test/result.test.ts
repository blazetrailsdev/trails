import "@blazetrails/vitest-matchers";
import { Enumerator, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";
import type { Connection } from "../lib/connection.js";

const ENV = TopLevel.ENV!;
const conninfo = {
  host: ENV["PGHOST"] ?? "localhost",
  port: ENV["PGPORT"] ?? "5432",
  user: ENV["PGUSER"],
  password: ENV["PGPASSWORD"],
  dbname: "activerecord_unittest",
};

describe("PG::Result", () => {
  let conn: Connection;

  beforeEach(async () => {
    conn = await PG.connect(conninfo);
    await conn.exec("BEGIN");
  });

  afterEach(async () => {
    await conn.exec("ROLLBACK");
    await conn.finish();
  });

  // BLOCKED: pg-result-type-map-defaults-to-strings-for-oids-with-no-coder
  it.skip("yields a row as an Enumerator of hashes", async () => {
    const res = await conn.exec("SELECT 1 AS a, 2 AS b");
    const e = res.each();
    expect(e).toBeInstanceOf(Enumerator);
    expect(e.size()).toBe(1);
    expect(e.toA()).toEqual([{ a: "1", b: "2" }]);
  });

  it("encapsulates errors in a PG::Error object", async () => {
    let exception: InstanceType<typeof PG.Error> | null = null;
    try {
      await conn.exec("SELECT * FROM nonexistent_table");
    } catch (err) {
      if (!(err instanceof PG.Error)) throw err;
      exception = err;
    }

    const result = exception!.result as InstanceType<typeof PG.Result>;

    expect(result).toBeInstanceOf(PG.Result);
    expect(result.errorField(PG.PG_DIAG_SEVERITY)).toBe("ERROR");
    expect(result.errorField(PG.PG_DIAG_SQLSTATE)).toBe("42P01");
    expect(result.errorField(PG.PG_DIAG_MESSAGE_PRIMARY)).toBe(
      'relation "nonexistent_table" does not exist',
    );
    expect(result.errorField(PG.PG_DIAG_MESSAGE_DETAIL)).toBeNull();
    expect(result.errorField(PG.PG_DIAG_MESSAGE_HINT)).toBeNull();
    expect(result.errorField(PG.PG_DIAG_STATEMENT_POSITION)).toBe("15");
    expect(result.errorField(PG.PG_DIAG_INTERNAL_POSITION)).toBeNull();
    expect(result.errorField(PG.PG_DIAG_INTERNAL_QUERY)).toBeNull();
    expect(result.errorField(PG.PG_DIAG_CONTEXT)).toBeNull();
    expect(result.errorField(PG.PG_DIAG_SOURCE_FILE)).toMatch(/parse_relation\.c$|namespace\.c$/);
    expect(result.errorField(PG.PG_DIAG_SOURCE_LINE)).toMatch(/^\d+$/);
    expect(result.errorField(PG.PG_DIAG_SOURCE_FUNCTION)).toMatch(
      /^parserOpenTable$|^RangeVarGetRelid$/,
    );
  });

  it("raises allow for conversion to an array of arrays", async () => {
    await conn.exec("CREATE TABLE valuestest ( foo varchar(33) )");
    await conn.exec("INSERT INTO valuestest (\"foo\") values ('bar')");
    await conn.exec("INSERT INTO valuestest (\"foo\") values ('bar2')");

    const res = await conn.exec("SELECT * FROM valuestest");
    expect(res.values()).toEqual([["bar"], ["bar2"]]);
  });

  it("can retrieve field names", async () => {
    const res = await conn.exec('SELECT 1 AS a, 2 AS "B"');
    expect(res.fields()).toEqual(["a", "B"]);
  });

  it("can return the type modifier for a result column", async () => {
    await conn.exec("CREATE TABLE fmodtest ( foo varchar(33) )");
    const res = await conn.exec("SELECT * FROM fmodtest");
    expect(res.fmod(0)).toBe(33 + 4);
  });

  it("raises a ServerError for an unknown SQLSTATE class", async () => {
    const oldError1 = PG.ERROR_CLASSES["42P01"];
    delete PG.ERROR_CLASSES["42P01"];
    const oldError2 = PG.ERROR_CLASSES["42"];
    delete PG.ERROR_CLASSES["42"];
    try {
      const exec = conn.exec("SELECT * FROM nonexistent_table");
      await expect(exec).rejects.toThrow(PG.ServerError);
      const error = await exec.catch((e: unknown) => e);
      expect(error).toBeExactInstanceOf(PG.ServerError);
      expect(String(error)).toMatch(/relation "nonexistent_table" does not exist/);
    } finally {
      if (oldError1 !== undefined) PG.ERROR_CLASSES["42P01"] = oldError1;
      if (oldError2 !== undefined) PG.ERROR_CLASSES["42"] = oldError2;
    }
  });
});
