/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/hstore_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import {
  Hstore,
  parseHstore,
  serializeHstore,
} from "../../connection-adapters/postgresql/oid/hstore.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeAll(async () => {
    const setup = new PostgreSQLAdapter(PG_TEST_URL);
    await setup.exec(`CREATE EXTENSION IF NOT EXISTS hstore`);
    await setup.close();
  });

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS hstores`);
    await adapter.exec(`
      CREATE TABLE hstores (
        id serial primary key,
        tags hstore DEFAULT '',
        payload hstore[],
        settings hstore
      )
    `);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS hstores`);
    await adapter.close();
  });

  describe("PostgresqlHstoreTest", () => {
    it("column", async () => {
      const rows = await adapter.execute(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'hstores' AND column_name = 'tags'
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0].data_type).toBe("USER-DEFINED");
    });

    it.skip("default", async () => {
      /* needs add_column + column_defaults */
    });
    it.skip("change column default with hstore", async () => {
      /* needs change_column_default */
    });

    it("type cast hstore", async () => {
      expect(parseHstore('"1"=>"2"')).toEqual({ "1": "2" });
      expect(parseHstore("")).toEqual({});
    });

    it("hstore nil", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES (NULL)`);
      const rows = await adapter.execute(`SELECT tags FROM hstores`);
      expect(rows[0].tags).toBeNull();
    });

    it("hstore with empty string", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [serializeHstore({ a: "" })]);
      const rows = await adapter.execute(`SELECT tags FROM hstores`);
      const parsed = parseHstore(rows[0].tags as string);
      expect(parsed.a).toBe("");
    });

    it("hstore with single quotes", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "b'c" }),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM hstores`);
      const parsed = parseHstore(rows[0].tags as string);
      expect(parsed.a).toBe("b'c");
    });

    it("hstore with double quotes", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: 'b"c' }),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM hstores`);
      const parsed = parseHstore(rows[0].tags as string);
      expect(parsed.a).toBe('b"c');
    });

    it("hstore with commas", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "b,c" }),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM hstores`);
      const parsed = parseHstore(rows[0].tags as string);
      expect(parsed.a).toBe("b,c");
    });

    it("hstore with special chars", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "b=>c" }),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM hstores`);
      const parsed = parseHstore(rows[0].tags as string);
      expect(parsed.a).toBe("b=>c");
    });

    it("hstore with unicode", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "日本語" }),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM hstores`);
      const parsed = parseHstore(rows[0].tags as string);
      expect(parsed.a).toBe("日本語");
    });

    it("hstore select", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2" }),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM hstores`);
      const parsed = parseHstore(rows[0].tags as string);
      expect(parsed).toEqual({ a: "1", b: "2" });
    });

    it("hstore rewrite", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1" }),
      ]);
      const rows = await adapter.execute(`SELECT id FROM hstores`);
      const id = rows[0].id;
      await adapter.execute(`UPDATE hstores SET tags = $1 WHERE id = $2`, [
        serializeHstore({ a: "1", b: "2" }),
        id,
      ]);
      const updated = await adapter.execute(`SELECT tags FROM hstores WHERE id = $1`, [id]);
      const parsed = parseHstore(updated[0].tags as string);
      expect(parsed).toEqual({ a: "1", b: "2" });
    });

    it.skip("hstore with store accessors", async () => {
      /* needs store_accessor on Base model */
    });
    it.skip("hstore dirty tracking", async () => {
      /* needs Base model dirty tracking */
    });
    it.skip("hstore duplication", async () => {
      /* needs Base model dup */
    });
    it.skip("hstore mutate", async () => {
      /* needs Base model change tracking */
    });
    it.skip("hstore nested", async () => {
      /* needs Base model */
    });
    it("hstore where", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2" }),
      ]);
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ c: "3" }),
      ]);
      const rows = await adapter.execute(`SELECT * FROM hstores WHERE tags @> $1::hstore`, [
        serializeHstore({ a: "1" }),
      ]);
      expect(rows).toHaveLength(1);
    });
    it("hstore where key", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2" }),
      ]);
      const rows = await adapter.execute(`SELECT * FROM hstores WHERE exist(tags, 'a')`);
      expect(rows).toHaveLength(1);
    });
    it("hstore where value", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2" }),
      ]);
      const rows = await adapter.execute(`SELECT tags -> 'a' AS val FROM hstores`);
      expect(rows[0].val).toBe("1");
    });
    it("hstore contains", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2" }),
      ]);
      const rows = await adapter.execute(`SELECT tags @> '"a"=>"1"'::hstore AS r FROM hstores`);
      expect(rows[0].r).toBe(true);
    });
    it("hstore contained", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1" }),
      ]);
      const rows = await adapter.execute(
        `SELECT tags <@ '"a"=>"1", "b"=>"2"'::hstore AS r FROM hstores`,
      );
      expect(rows[0].r).toBe(true);
    });
    it("hstore keys", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2" }),
      ]);
      const rows = await adapter.execute(`SELECT akeys(tags) AS keys FROM hstores`);
      const keys = rows[0].keys as string[];
      expect(keys.sort()).toEqual(["a", "b"]);
    });
    it("hstore values", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2" }),
      ]);
      const rows = await adapter.execute(`SELECT avals(tags) AS vals FROM hstores`);
      const vals = rows[0].vals as string[];
      expect(vals.sort()).toEqual(["1", "2"]);
    });
    it("hstore merge", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1" }),
      ]);
      const rows = await adapter.execute(`SELECT id FROM hstores`);
      const id = rows[0].id;
      await adapter.execute(`UPDATE hstores SET tags = tags || '"b"=>"2"'::hstore WHERE id = $1`, [
        id,
      ]);
      const updated = await adapter.execute(`SELECT tags FROM hstores WHERE id = $1`, [id]);
      const parsed = parseHstore(updated[0].tags as string);
      expect(parsed).toEqual({ a: "1", b: "2" });
    });
    it("hstore delete key", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2" }),
      ]);
      const rows = await adapter.execute(`SELECT delete(tags, 'a') AS r FROM hstores`);
      const parsed = parseHstore(rows[0].r as string);
      expect(parsed).toEqual({ b: "2" });
    });
    it("hstore delete keys", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ($1)`, [
        serializeHstore({ a: "1", b: "2", c: "3" }),
      ]);
      const rows = await adapter.execute(`SELECT delete(tags, ARRAY['a', 'b']) AS r FROM hstores`);
      const parsed = parseHstore(rows[0].r as string);
      expect(parsed).toEqual({ c: "3" });
    });
    it("hstore concat", async () => {
      const rows = await adapter.execute(`SELECT '"a"=>"1"'::hstore || '"b"=>"2"'::hstore AS r`);
      const parsed = parseHstore(rows[0].r as string);
      expect(parsed).toEqual({ a: "1", b: "2" });
    });
    it("hstore replace", async () => {
      const rows = await adapter.execute(
        `SELECT '"a"=>"1", "b"=>"2"'::hstore || '"a"=>"99"'::hstore AS r`,
      );
      const parsed = parseHstore(rows[0].r as string);
      expect(parsed.a).toBe("99");
      expect(parsed.b).toBe("2");
    });
    it("hstore to array", async () => {
      const rows = await adapter.execute(`SELECT hstore_to_array('"a"=>"1"'::hstore) AS r`);
      expect(rows[0].r).toEqual(["a", "1"]);
    });
    it("hstore each", async () => {
      const rows = await adapter.execute(
        `SELECT key, value FROM each('"a"=>"1", "b"=>"2"'::hstore) ORDER BY key`,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].key).toBe("a");
      expect(rows[0].value).toBe("1");
    });
    it("hstore exists", async () => {
      const rows = await adapter.execute(`SELECT exist('"a"=>"1"'::hstore, 'a') AS r`);
      expect(rows[0].r).toBe(true);
    });
    it("hstore defined", async () => {
      const rows = await adapter.execute(`SELECT defined('"a"=>"1"'::hstore, 'a') AS r`);
      expect(rows[0].r).toBe(true);
      const nullRows = await adapter.execute(`SELECT defined('"a"=>NULL'::hstore, 'a') AS r`);
      expect(nullRows[0].r).toBe(false);
    });
    it("hstore akeys", async () => {
      const rows = await adapter.execute(`SELECT akeys('"a"=>"1", "b"=>"2"'::hstore) AS r`);
      expect((rows[0].r as string[]).sort()).toEqual(["a", "b"]);
    });
    it("hstore avals", async () => {
      const rows = await adapter.execute(`SELECT avals('"a"=>"1", "b"=>"2"'::hstore) AS r`);
      expect((rows[0].r as string[]).sort()).toEqual(["1", "2"]);
    });
    it("hstore skeys", async () => {
      const rows = await adapter.execute(
        `SELECT skeys('"a"=>"1", "b"=>"2"'::hstore) AS skeys ORDER BY skeys`,
      );
      expect(rows.map((r) => r.skeys)).toEqual(["a", "b"]);
    });
    it("hstore svals", async () => {
      const rows = await adapter.execute(
        `SELECT svals('"a"=>"1", "b"=>"2"'::hstore) AS svals ORDER BY svals`,
      );
      expect(rows.map((r) => r.svals)).toEqual(["1", "2"]);
    });
    it("hstore to json", async () => {
      const rows = await adapter.execute(
        `SELECT hstore_to_json('"a"=>"1", "b"=>"2"'::hstore) AS r`,
      );
      expect(rows[0].r).toEqual({ a: "1", b: "2" });
    });
    it.skip("hstore populate", async () => {
      /* needs populate_record() with a composite type */
    });
    it.skip("hstore schema dump", async () => {
      /* needs schema dumper */
    });
    it.skip("hstore migration", async () => {
      /* needs migration API */
    });
    it.skip("hstore gen random uuid", async () => {
      /* needs gen_random_uuid() */
    });
    it.skip("hstore gen random uuid default", async () => {
      /* needs gen_random_uuid() default */
    });
    it.skip("hstore fixture", async () => {
      /* needs fixture loading */
    });

    it("hstore included in extensions", async () => {
      const rows = await adapter.execute(
        `SELECT extname FROM pg_extension WHERE extname = 'hstore'`,
      );
      expect(rows).toHaveLength(1);
    });

    it.skip("disable enable hstore", () => {
      /* needs enable_extension/disable_extension API */
    });
    it.skip("change table supports hstore", () => {
      /* needs change_table API */
    });
    it.skip("cast value on write", () => {
      /* needs Base model with hstore attribute */
    });
    it.skip("with store accessors", () => {
      /* needs store_accessor */
    });
    it.skip("duplication with store accessors", () => {
      /* needs store_accessor */
    });
    it.skip("yaml round trip with store accessors", () => {
      /* needs YAML serialization */
    });
    it.skip("changes with store accessors", () => {
      /* needs store_accessor + dirty tracking */
    });
    it.skip("changes in place", () => {
      /* needs in-place change detection */
    });
    it.skip("dirty from user equal", () => {
      /* needs dirty tracking */
    });
    it.skip("hstore dirty from database equal", () => {
      /* needs dirty tracking */
    });

    it("spaces", () => {
      expect(parseHstore('"a "=>"b "')).toEqual({ "a ": "b " });
    });

    it("commas", () => {
      expect(parseHstore('"a,"=>"b,"')).toEqual({ "a,": "b," });
    });

    it("signs", () => {
      expect(parseHstore('"a>"=>"b>"')).toEqual({ "a>": "b>" });
    });

    it("various null", () => {
      expect(parseHstore('"a"=>NULL')).toEqual({ a: null });
    });

    it("equal signs", () => {
      expect(parseHstore('"a="=>"b="')).toEqual({ "a=": "b=" });
    });

    it("parse5", () => {
      expect(parseHstore('"a=>"=>"b=>"')).toEqual({ "a=>": "b=>" });
    });

    it("parse6", () => {
      expect(parseHstore('"\\"a"=>"\\"b"')).toEqual({ '"a': '"b' });
    });

    it("parse7", () => {
      expect(parseHstore('"a"=>"1", "b"=>"2"')).toEqual({ a: "1", b: "2" });
    });

    it("rewrite", () => {
      const input = { a: "1", b: "2" };
      const serialized = serializeHstore(input);
      const parsed = parseHstore(serialized);
      expect(parsed).toEqual(input);
    });

    it.skip("array cycle", () => {
      /* needs hstore array support */
    });
    it.skip("array strings with quotes", () => {
      /* needs hstore array support */
    });
    it.skip("array strings with commas", () => {
      /* needs hstore array support */
    });
    it.skip("array strings with array delimiters", () => {
      /* needs hstore array support */
    });
    it.skip("array strings with null strings", () => {
      /* needs hstore array support */
    });
    it.skip("select multikey", () => {
      /* needs slice() */
    });

    it("nil", () => {
      expect(parseHstore('"a"=>NULL')).toEqual({ a: null });
    });

    it("quotes", () => {
      expect(parseHstore('"a"=>"\\"b\\""')).toEqual({ a: '"b"' });
    });

    it("whitespace", () => {
      expect(parseHstore('"a"=>"b  "')).toEqual({ a: "b  " });
    });

    it("backslash", () => {
      expect(parseHstore('"a"=>"\\\\b"')).toEqual({ a: "\\b" });
    });

    it("comma", () => {
      expect(parseHstore('"a"=>"b,c"')).toEqual({ a: "b,c" });
    });

    it("arrow", () => {
      expect(parseHstore('"a"=>"b=>c"')).toEqual({ a: "b=>c" });
    });

    it("quoting special characters", () => {
      expect(parseHstore('"a"=>"b\\"c"')).toEqual({ a: 'b"c' });
    });

    it("multiline", () => {
      // Rails' test_multiline does assert_cycle({"a\nb" => "c\nd"}). PG
      // stores the newline as a literal character inside the quoted
      // value, not as a \n escape. Round-trip through serializeHstore /
      // parseHstore and assert the value is preserved.
      const input = { "a\nb": "c\nd" };
      expect(parseHstore(serializeHstore(input))).toEqual(input);
    });

    it.skip("hstore with serialized attributes", () => {
      /* needs serialize API */
    });
    it.skip("clone hstore with serialized attributes", () => {
      /* needs serialize + clone */
    });
    it.skip("supports to unsafe h values", () => {
      /* Ruby-specific: to_unsafe_h */
    });

    it.skip("select", async () => {
      /* duplicate of hstore select */
    });

    it.skip("contains nils", async () => {
      /* needs Base model with hstore */
    });

    it.skip("schema dump with shorthand", async () => {
      /* needs schema dumper */
    });
  });
});

// Unit-level tests against Hstore — no DB required. Rails test names.
describe("PostgresqlHstoreTest", () => {
  it("deserialize", () => {
    const type = new Hstore();
    expect(type.deserialize('"a"=>"b", "c"=>"d"')).toEqual({ a: "b", c: "d" });
    expect(type.deserialize('"a"=>NULL')).toEqual({ a: null });
    expect(type.deserialize(null)).toBeNull();
  });

  it("serialize", () => {
    const type = new Hstore();
    expect(type.serialize({ a: "b" })).toBe('"a"=>"b"');
    expect(type.serialize({ a: null })).toBe('"a"=>NULL');
    expect(type.serialize({ a: "" })).toBe('"a"=>""');
  });
});
