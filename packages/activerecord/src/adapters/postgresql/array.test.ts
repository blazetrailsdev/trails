/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/array_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS pg_arrays`);
    await adapter.exec(`
      CREATE TABLE pg_arrays (
        id serial primary key,
        tags character varying(255)[],
        ratings integer[],
        decimals numeric(10,2)[] DEFAULT '{}',
        timestamps timestamp[] DEFAULT '{}'
      )
    `);
    await adapter.loadAdditionalTypes();
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS pg_arrays`);
    await adapter.close();
  });

  describe("PostgresqlArrayTest", () => {
    it.skip("column", async () => {
      /* BLOCKED: Column#isArray() / array? missing in column.ts (~15 LOC) */
    });
    it.skip("not compatible with serialize array", async () => {
      // BLOCKED: adapter-pg — serialize decorator gap
      // ROOT-CAUSE: Base.serialize() in base.ts does not raise ColumnNotSerializableError for
      //   array-typed columns; the error class itself is also not yet defined.
      // SCOPE: ~30 LOC — add ColumnNotSerializableError to errors.ts + guard in serialize() decorator
    });
    it.skip("array with serialized attributes", async () => {
      // BLOCKED: adapter-pg — serialize decorator coder path missing
      // ROOT-CAUSE: Base.serialize({ coder: ... }) in base.ts not wired; coder encode/decode
      //   lifecycle around the OID::Array serialize/deserialize chain is not implemented.
      // SCOPE: ~50 LOC in base.ts serialize decorator + integration with attribute-set lifecycle
    });
    it.skip("default", async () => {
      /* BLOCKED: addColumn integer-array default DDL; same root as "default strings" (~20 LOC) */
    });
    it.skip("default strings", async () => {
      // BLOCKED: adapter-pg — addColumn array default DDL gap
      // ROOT-CAUSE: postgresql/schema-statements.ts addColumn does not serialize array defaults
      //   (e.g. ["foo","bar"]) into PG literal form (e.g. ARRAY['foo','bar']) for the DEFAULT clause.
      // SCOPE: ~20 LOC in connection-adapters/postgresql/schema-statements.ts
    });
    it.skip("schema dump with shorthand", async () => {
      /* BLOCKED: schema_dumper.ts array:true emission missing; needs column.isArray() (~10 LOC) */
    });
    it.skip("change column with array", async () => {
      // BLOCKED: adapter-pg — Column#array? introspection missing
      // ROOT-CAUSE: connection-adapters/postgresql/column.ts has no `array` boolean field /
      //   `isArray()` method; columnsHash entries cannot report array?: true after changeColumn.
      // SCOPE: ~15 LOC in column.ts + wire through schema-statements changeColumn
    });
    it.skip("change column from non array to array", async () => {
      // BLOCKED: adapter-pg — Column#array? introspection + changeColumn USING clause missing
      // ROOT-CAUSE: same as "change column with array"; additionally changeColumn does not accept
      //   a `using:` option to emit the USING expression in ALTER COLUMN TYPE.
      // SCOPE: ~20 LOC in column.ts + schema-statements.ts changeColumn
    });
    it.skip("change column cant make non array column to array", async () => {
      // BLOCKED: adapter-pg — StatementInvalid wrapping missing for DDL errors
      // ROOT-CAUSE: adapter's executeStatement (postgresql-adapter.ts) does not catch PG
      //   constraint/type errors and re-raise as ActiveRecord::StatementInvalid; the error class
      //   is also not yet exported from errors.ts.
      // SCOPE: ~20 LOC — StatementInvalid error class + catch-rethrow in executeStatement
    });
    it.skip("change column default with array", async () => {
      // BLOCKED: adapter-pg — changeColumnDefault array serialization missing
      // ROOT-CAUSE: schema-statements changeColumnDefault passes the value through quoteDefault
      //   but does not serialize JS arrays via OID::Array before quoting; PG receives a JS
      //   stringified value instead of a valid array literal.
      // SCOPE: ~10 LOC in connection-adapters/postgresql/schema-statements.ts
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
      await adapter.execute(`UPDATE pg_arrays SET tags = '{"1","2","3","4"}' WHERE id = $1`, [id]);
      const updated = await adapter.execute(`SELECT tags FROM pg_arrays WHERE id = $1`, [id]);
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
      await adapter.execute(`UPDATE pg_arrays SET ratings = '{2,3,4}' WHERE id = $1`, [id]);
      const updated = await adapter.execute(`SELECT ratings FROM pg_arrays WHERE id = $1`, [id]);
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

    it("with multi dimensional empty strings", async () => {
      const { Base } = await import("../../index.js");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.adapter = adapter;
        }
      }
      await PgArrays.loadSchema();
      const arr = [
        [
          ["1", "2"],
          ["", "4"],
          ["", "5"],
        ],
      ];
      const r = await (PgArrays as any).create({ tags: arr });
      await (r as any).reload();
      expect((r as any).tags).toEqual(arr);
    });

    it("with arbitrary whitespace", async () => {
      const { Base } = await import("../../index.js");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.adapter = adapter;
        }
      }
      await PgArrays.loadSchema();
      const arr = [
        [
          ["1", "2"],
          ["    ", "4"],
          ["    ", "5"],
        ],
      ];
      const r = await (PgArrays as any).create({ tags: arr });
      await (r as any).reload();
      expect((r as any).tags).toEqual(arr);
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
      // BLOCKED: adapter-pg — insert_fixture API missing
      // ROOT-CAUSE: PostgreSQLAdapter has no insertFixture() method; Rails' connection.insert_fixture
      //   serializes fixture hash values through the column types and executes a single INSERT.
      // SCOPE: ~20 LOC in postgresql-adapter.ts + abstract-adapter insertFixture
    });
    it("attribute for inspect for array field", async () => {
      const { Base } = await import("../../index.js");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.adapter = adapter;
        }
      }
      await PgArrays.loadSchema();
      const record = new PgArrays();
      (record as any).ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect((record as any).attributeForInspect("ratings")).toBe(
        "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]",
      );
    });
    it("attribute for inspect for array field for large array", async () => {
      const { Base } = await import("../../index.js");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.adapter = adapter;
        }
      }
      await PgArrays.loadSchema();
      const record = new PgArrays();
      (record as any).ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      expect((record as any).attributeForInspect("ratings")).toBe(
        "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]",
      );
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

    it("quoting non standard delimiters", async () => {
      const { Array: OidArray } = await import("../../connection-adapters/postgresql/oid/array.js");
      const stringSubtype = {
        type: "string",
        cast: (v: unknown) => (v == null ? null : String(v)),
        serialize: (v: unknown) => (v == null ? null : String(v)),
        deserialize: (v: unknown) => (v == null ? null : String(v)),
      };
      const strings = ["hello,", "world;"];
      const commaDelim = new OidArray(stringSubtype, ",");
      const semicolonDelim = new OidArray(stringSubtype, ";");
      expect(String(commaDelim.serialize(strings))).toBe('{"hello,",world;}');
      expect(String(semicolonDelim.serialize(strings))).toBe('{hello,;"world;"}');
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
      // BLOCKED: adapter-pg — hstore array subtype missing
      // ROOT-CAUSE: OID::HStore type (connection-adapters/postgresql/oid/hstore.ts) is not wired
      //   as the element subtype for `hstores hstore[]` columns; the hstores column is not
      //   registered in the type-map initializer as an array-of-hstore OID.
      // SCOPE: ~15 LOC — wire hstore OID as array element subtype in type-map-initializer.ts
    });
    it.skip("datetime with timezone awareness", async () => {
      // BLOCKED: adapter-pg — timezone-aware datetime deserialization missing
      // ROOT-CAUSE: OID::DateTime (or the timestamp array subtype) does not respect
      //   ActiveSupport::TimeZone when casting array elements; `in_time_zone` / `Time.zone`
      //   infrastructure not ported to TS.
      // SCOPE: large — requires TimeZone registry port; defer to a dedicated timezone PR
    });
    it("assigning non array value", async () => {
      const { Base } = await import("../../index.js");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.adapter = adapter;
        }
      }
      await PgArrays.loadSchema();
      const record = new PgArrays({ tags: "not-an-array" } as any);
      expect((record as any).tags).toEqual([]);
      expect((record as any).attributeBeforeTypeCast("tags")).toBe("not-an-array");
      const saved = await record.save();
      expect(saved).toBe(true);
      const reloaded = await PgArrays.find((record as any).id);
      expect((reloaded as any).tags).toEqual([]);
    });
    it("assigning empty string", async () => {
      const { Base } = await import("../../index.js");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.adapter = adapter;
        }
      }
      await PgArrays.loadSchema();
      const record = new PgArrays({ tags: "" } as any);
      expect((record as any).tags).toEqual([]);
      expect((record as any).attributeBeforeTypeCast("tags")).toBe("");
      const saved = await record.save();
      expect(saved).toBe(true);
      const reloaded = await PgArrays.find((record as any).id);
      expect((reloaded as any).tags).toEqual([]);
    });
    it("assigning valid pg array literal", async () => {
      const { Base } = await import("../../index.js");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.adapter = adapter;
        }
      }
      await PgArrays.loadSchema();
      const record = new PgArrays({ tags: "{1,2,3}" } as any);
      expect((record as any).tags).toEqual(["1", "2", "3"]);
      expect((record as any).attributeBeforeTypeCast("tags")).toBe("{1,2,3}");
      const saved = await record.save();
      expect(saved).toBe(true);
      const reloaded = await PgArrays.find((record as any).id);
      expect((reloaded as any).tags).toEqual(["1", "2", "3"]);
    });

    it("where by attribute with array", async () => {
      const tags = ["black", "blue"];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT * FROM pg_arrays WHERE tags = $1`, [tags]);
      expect(rows).toHaveLength(1);
      expect(rows[0].tags).toEqual(tags);
    });

    it.skip("uniqueness validation", async () => {
      // BLOCKED: adapter-pg — validates_uniqueness_of array serialization gap
      // ROOT-CAUSE: uniqueness validator builds a WHERE clause by serializing the attribute value;
      //   OID::Array#serialize returns a Data object whose toString() is the PG literal, but the
      //   WHERE-clause quoting path in quoting.ts does not handle ArrayData in the bind-param
      //   position for uniqueness checks (separate from the INSERT path).
      // SCOPE: ~10 LOC — verify quoting.ts bindToSql handles ArrayData for WHERE params
    });

    it("encoding arrays of utf8 strings", async () => {
      const tags = ["nový", "ファイル"];
      await adapter.execute(`INSERT INTO pg_arrays (tags) VALUES ($1)`, [tags]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it.skip("precision is respected on timestamp columns", async () => {
      // BLOCKED: adapter-pg — timestamp array microsecond precision not preserved
      // ROOT-CAUSE: OID::DateTime subtype used for timestamp[] columns does not cast the usec
      //   component of a Temporal.Instant/Date through the Temporal.PlainDateTime precision path;
      //   precision: 6 column metadata is not plumbed to the timestamp array subtype's cast.
      // SCOPE: ~20 LOC — plumb precision through OID::Array → DateTime subtype constructor
    });
  });
});
