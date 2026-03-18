/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/array_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
    await adapter.execute(`DROP TABLE IF EXISTS pg_arrays`);
    await adapter.execute(`
      CREATE TABLE pg_arrays (
        id serial primary key,
        tags character varying(255)[],
        ratings integer[],
        decimals numeric(10,2)[] DEFAULT '{}',
        timestamps timestamp[] DEFAULT '{}'
      )
    `);
  });
  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS pg_arrays`);
    await adapter.close();
  });

  describe("PostgresqlArrayTest", () => {
    it.skip("not compatible with serialize array", async () => {
      /* needs serialize API */
    });
    it.skip("array with serialized attributes", async () => {
      /* needs serialize API */
    });
    it.skip("default strings", async () => {
      /* needs add_column + column_defaults */
    });
    it.skip("change column with array", async () => {
      /* needs column introspection with array? predicate */
    });
    it.skip("change column from non array to array", async () => {
      /* needs column introspection with array? predicate */
    });
    it.skip("change column cant make non array column to array", async () => {
      /* needs StatementInvalid error wrapping */
    });
    it.skip("change column default with array", async () => {
      /* needs change_column_default */
    });

    it("type cast array", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ('{1,2,3}')`);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(["1", "2", "3"]);

      await adapter.execute(`DELETE FROM pg_arrays`);
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ('{}')`);
      const rows2 = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows2[0].tags).toEqual([]);
    });

    it("type cast integers", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (ratings) VALUES ('{1,2}')`);
      const rows = await adapter.execute(`SELECT ratings FROM pg_arrays`);
      expect(rows[0].ratings).toEqual([1, 2]);
    });

    it("select with strings", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ('{1,2,3}')`);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(["1", "2", "3"]);
    });

    it("rewrite with strings", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ('{1,2,3}')`);
      const rows = await adapter.execute(`SELECT id FROM pg_arrays`);
      const id = rows[0].id;
      await adapter.execute(`UPDATE pg_arrays SET tags = '{"1","2","3","4"}' WHERE id = ${id}`);
      const updated = await adapter.execute(`SELECT tags FROM pg_arrays WHERE id = ${id}`);
      expect(updated[0].tags).toEqual(["1", "2", "3", "4"]);
    });

    it("select with integers", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (ratings) VALUES ('{1,2,3}')`);
      const rows = await adapter.execute(`SELECT ratings FROM pg_arrays`);
      expect(rows[0].ratings).toEqual([1, 2, 3]);
    });

    it("rewrite with integers", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (ratings) VALUES ('{1,2,3}')`);
      const rows = await adapter.execute(`SELECT id FROM pg_arrays`);
      const id = rows[0].id;
      await adapter.execute(`UPDATE pg_arrays SET ratings = '{2,3,4}' WHERE id = ${id}`);
      const updated = await adapter.execute(`SELECT ratings FROM pg_arrays WHERE id = ${id}`);
      expect(updated[0].ratings).toEqual([2, 3, 4]);
    });

    it("multi dimensional with strings", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ('{{"1","2"},{"2","3"}}')`);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual([
        ["1", "2"],
        ["2", "3"],
      ]);
    });

    it("with empty strings", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ('{"1","2","","4","","5"}')`);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(["1", "2", "", "4", "", "5"]);
    });

    it.skip("with multi dimensional empty strings", async () => {
      /* pg module doesn't handle multi-dim with empty strings well */
    });

    it.skip("with arbitrary whitespace", async () => {
      /* pg module doesn't handle multi-dim with whitespace well */
    });

    it("multi dimensional with integers", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (ratings) VALUES ('{{1,7},{8,10}}')`);
      const rows = await adapter.execute(`SELECT ratings FROM pg_arrays`);
      expect(rows[0].ratings).toEqual([
        [1, 7],
        [8, 10],
      ]);
    });

    it("strings with quotes", async () => {
      const tags = ["this has", 'some "s that need to be escaped"'];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it("strings with commas", async () => {
      const tags = ["this,has", "many,values"];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it("strings with array delimiters", async () => {
      const tags = ["{", "}"];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it("strings with null strings", async () => {
      const tags = ["NULL", "NULL"];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it.skip("insert fixture", async () => {
      /* needs fixture insertion API */
    });
    it.skip("attribute for inspect for array field", async () => {
      /* needs attribute_for_inspect on Base model */
    });
    it.skip("attribute for inspect for array field for large array", async () => {
      /* needs attribute_for_inspect on Base model */
    });

    it("escaping", async () => {
      const unknown = 'foo\\",bar,baz,\\';
      const tags = [`hello_${unknown}`];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it("string quoting rules match pg behavior", async () => {
      const tags = [
        "",
        "one{",
        "two}",
        'three"',
        "four\\",
        "five ",
        "six\t",
        "seven\n",
        "eight,",
        "nine",
        "ten\r",
        "NULL",
      ];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it.skip("quoting non standard delimiters", async () => {
      /* needs OID::Array type with custom delimiter */
    });

    it("mutate array", async () => {
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [["one", "two"]]);
      const rows = await adapter.execute(`SELECT id, tags FROM pg_arrays`);
      const id = rows[0].id;
      const tags = rows[0].tags as string[];
      tags.push("three");
      await adapter.execute(`UPDATE pg_arrays SET tags = $1 WHERE id = $2`, [tags, id]);
      const updated = await adapter.execute(`SELECT tags FROM pg_arrays WHERE id = $1`, [id]);
      expect(updated[0].tags).toEqual(["one", "two", "three"]);
    });

    it.skip("mutate value in array", async () => {
      /* needs hstore array support */
    });
    it.skip("datetime with timezone awareness", async () => {
      /* needs timezone infrastructure */
    });
    it.skip("assigning non array value", async () => {
      /* needs Base model with array attribute */
    });
    it.skip("assigning empty string", async () => {
      /* needs Base model with array attribute */
    });
    it.skip("assigning valid pg array literal", async () => {
      /* needs Base model with array attribute */
    });

    it("where by attribute with array", async () => {
      const tags = ["black", "blue"];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT * FROM pg_arrays WHERE tags = $1`, [tags]);
      expect(rows).toHaveLength(1);
      expect(rows[0].tags).toEqual(tags);
    });

    it.skip("uniqueness validation", async () => {
      /* needs validates_uniqueness_of on Base model */
    });

    it("encoding arrays of utf8 strings", async () => {
      const tags = ["nový", "ファイル"];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it.skip("precision is respected on timestamp columns", async () => {
      /* needs timestamp precision handling */
    });
  });
});
