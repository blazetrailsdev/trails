/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/hstore_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";
import { parseHstore, serializeHstore } from "./hstore.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;

  beforeAll(async () => {
    const setup = new PostgresAdapter(PG_TEST_URL);
    await setup.exec(`CREATE EXTENSION IF NOT EXISTS hstore`);
    await setup.close();
  });

  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
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
    it.skip("hstore where", async () => {
      /* needs where with hstore operators */
    });
    it.skip("hstore where key", async () => {
      /* needs hstore ? operator */
    });
    it.skip("hstore where value", async () => {
      /* needs hstore -> operator */
    });
    it.skip("hstore contains", async () => {
      /* needs hstore @> operator */
    });
    it.skip("hstore contained", async () => {
      /* needs hstore <@ operator */
    });
    it.skip("hstore keys", async () => {
      /* needs akeys() */
    });
    it.skip("hstore values", async () => {
      /* needs avals() */
    });
    it.skip("hstore merge", async () => {
      /* needs hstore || operator */
    });
    it.skip("hstore delete key", async () => {
      /* needs hstore - operator */
    });
    it.skip("hstore delete keys", async () => {
      /* needs hstore - operator */
    });
    it.skip("hstore concat", async () => {
      /* needs hstore || operator */
    });
    it.skip("hstore replace", async () => {
      /* needs hstore || operator */
    });
    it.skip("hstore to array", async () => {
      /* needs hstore_to_array() */
    });
    it.skip("hstore each", async () => {
      /* needs each_hstore() */
    });
    it.skip("hstore exists", async () => {
      /* needs exist() */
    });
    it.skip("hstore defined", async () => {
      /* needs defined() */
    });
    it.skip("hstore akeys", async () => {
      /* needs akeys() */
    });
    it.skip("hstore avals", async () => {
      /* needs avals() */
    });
    it.skip("hstore skeys", async () => {
      /* needs skeys() */
    });
    it.skip("hstore svals", async () => {
      /* needs svals() */
    });
    it.skip("hstore to json", async () => {
      /* needs hstore_to_json() */
    });
    it.skip("hstore populate", async () => {
      /* needs populate_record() */
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
      expect(parseHstore('"a"=>"b\\nc"')).toEqual({ a: "b\nc" });
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
