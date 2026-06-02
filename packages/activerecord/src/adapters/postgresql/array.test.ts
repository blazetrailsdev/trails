/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/array_test.rb
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../../test-helpers/use-handler-transactional-fixtures.js";
import { Base } from "../../index.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// The pg_arrays table uses PG array columns (e.g. integer[],
// numeric(10,2)[]) which are not expressible via defineSchema. The table
// is created via raw DDL below; defineSchema({}) marks the file
// as TM-Phase-5 compliant. The outer per-test transaction rolls back
// inserts and any addColumn DDL done inside it() bodies.
setupHandlerSuite();
useHandlerTransactionalFixtures();

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await defineSchema({});
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
  afterAll(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS pg_arrays`).catch(() => {});
  });
  describe("PostgresqlArrayTest", () => {
    it("column", async () => {
      const columns = await adapter.columns("pg_arrays");
      const column = columns.find((c) => c.name === "tags")!;
      // Rails: assert_equal :string, @column.type (semantic type from OID cast)
      expect(column.type).toBe("string");
      // Rails: assert_equal "character varying(255)", @column.sql_type (stripped, no [])
      expect(column.sqlType).toBe("character varying(255)");
      expect((column as any).isArray()).toBe(true);
      // Rails: assert_not_predicate @type, :binary? — OID::Array is not binary
      expect(column.type).not.toBe("binary");

      const ratingsColumn = columns.find((c) => c.name === "ratings")!;
      // Rails: assert_equal :integer, ratings_column.type
      expect(ratingsColumn.type).toBe("integer");
      expect((ratingsColumn as any).isArray()).toBe(true);
    });
    it.skip("not compatible with serialize array", async () => {
      // BLOCKED: serialize machinery — no cast-type decoration step.
      // ColumnNotSerializableError already exists (attribute-methods/serialization.ts),
      // but serialize() (serialize.ts) only wraps readAttribute with a coder; it never
      // resolves the attribute's cast type, so it can't run Rails'
      // `type_incompatible_with_serialize?` (cast_type responds to type_cast_array &&
      // type == Array) to raise on an OID::Array column. Needs a decorate-attributes
      // step in the serialize machinery — a serialize-feature story, not array OID.
    });
    it.skip("array with serialized attributes", async () => {
      // BLOCKED: serialize machinery — custom-coder load/dump lifecycle.
      // serialize() supports "json"/"array"/"hash"/coder-object on read, but not Rails'
      // class-coder protocol (`MyTags.load`/`MyTags.dump`) layered over an OID::Array
      // column with full write+reload round-trip. Needs Type::Serialized-style wrapping
      // of the underlying array type — a serialize-feature story, not array OID.
    });
    it("default", async () => {
      await adapter.addColumn("pg_arrays", "score", "integer", { array: true, default: [4, 4, 2] });
      class PgArrays extends Base {
        static tableName = "pg_arrays";
      }
      await PgArrays.loadSchema();
      // Rails: assert_equal([4, 4, 2], PgArray.column_defaults["score"])
      expect((PgArrays as any).columnDefaults["score"]).toEqual([4, 4, 2]);
      // Rails: assert_equal([4, 4, 2], PgArray.new.score)
      expect((new PgArrays() as any).score).toEqual([4, 4, 2]);
    });
    it("default strings", async () => {
      await adapter.addColumn("pg_arrays", "names", "string", {
        array: true,
        default: ["foo", "bar"],
      });
      class PgArrays extends Base {
        static tableName = "pg_arrays";
      }
      await PgArrays.loadSchema();
      // Rails: assert_equal(["foo", "bar"], PgArray.column_defaults["names"])
      expect((PgArrays as any).columnDefaults["names"]).toEqual(["foo", "bar"]);
      // Rails: assert_equal(["foo", "bar"], PgArray.new.names)
      expect((new PgArrays() as any).names).toEqual(["foo", "bar"]);
    });
    it("schema dump with shorthand", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "pg_arrays");
      // TS migration format: t.type("name", { opts })
      expect(output).toMatch(/t\.string\("tags",/);
      expect(output).toMatch(/limit: 255/);
      expect(output).toMatch(/t\.integer\("ratings",/);
      // decimals column: checks presence of each option (order-independent)
      expect(output).toMatch(/t\.decimal\("decimals",/);
      expect(output).toMatch(/precision: 10/);
      expect(output).toMatch(/scale: 2/);
      expect(output).toMatch(/default: \[\]/);
      // all array columns must carry array: true
      const lines = output.split("\n");
      const tagsLine = lines.find((l) => l.includes('"tags"'))!;
      const ratingsLine = lines.find((l) => l.includes('"ratings"'))!;
      const decimalsLine = lines.find((l) => l.includes('"decimals"'))!;
      expect(tagsLine).toMatch(/array: true/);
      expect(ratingsLine).toMatch(/array: true/);
      expect(decimalsLine).toMatch(/array: true/);
    });
    it("change column with array", async () => {
      await adapter.addColumn("pg_arrays", "snippets", "string", { array: true, default: [] });
      await adapter.changeColumn("pg_arrays", "snippets", "text", { array: true, default: [] });
      const cols = await adapter.columns("pg_arrays");
      const column = cols.find((c) => c.name === "snippets")!;
      expect(column.type).toBe("text");
      expect((column as any).default).toEqual([]);
      expect((column as any).isArray()).toBe(true);
    });
    it("change column from non array to array", async () => {
      await adapter.addColumn("pg_arrays", "snippets", "string");
      await adapter.changeColumn("pg_arrays", "snippets", "text", {
        array: true,
        default: [],
        using: `string_to_array("snippets", ',')`,
      });
      const cols = await adapter.columns("pg_arrays");
      const column = cols.find((c) => c.name === "snippets")!;
      expect(column.type).toBe("text");
      expect((column as any).default).toEqual([]);
      expect((column as any).isArray()).toBe(true);
    });
    it.skip("change column cant make non array column to array", async () => {
      // BLOCKED: cross-cutting — DDL exec path does not translate driver errors.
      // ROOT-CAUSE: schema statements run DDL via `exec()` (postgresql-adapter.ts:1986),
      //   which is the bare driver call with no exception translation; only `execute()`
      //   routes through `_translateException` → StatementInvalid. PG raises a raw 42804
      //   ("cannot be cast automatically") here, so `assert_raises StatementInvalid` fails.
      // SCOPE: adapter-wide — route schema-statement DDL through the translating path
      //   (or wrap `exec`). Belongs in a DDL exception-translation story, not array OID.
    });
    it("change column default with array", async () => {
      await adapter.changeColumnDefault("pg_arrays", "tags", []);
      class PgArrays extends Base {
        static tableName = "pg_arrays";
      }
      await PgArrays.loadSchema();
      // Rails: assert_equal [], PgArray.column_defaults["tags"]
      expect((PgArrays as any).columnDefaults["tags"]).toEqual([]);
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
      class PgArrays extends Base {
        static tableName = "pg_arrays";
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
      class PgArrays extends Base {
        static tableName = "pg_arrays";
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

    it("insert fixture", async () => {
      const tagValues = ["val1", "val2", "val3_with_'_multiple_quote_'_chars"];
      await (adapter as any).insertFixture({ tags: tagValues }, "pg_arrays");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
      }
      await PgArrays.loadSchema();
      const last = await (PgArrays as any).last();
      // Rails: assert_equal(PgArray.last.tags, tag_values)
      expect((last as any).tags).toEqual(tagValues);
    });
    it("attribute for inspect for array field", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
      }
      await PgArrays.loadSchema();
      const record = new PgArrays();
      (record as any).ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect((record as any).attributeForInspect("ratings")).toBe(
        "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]",
      );
    });
    it("attribute for inspect for array field for large array", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
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
      // BLOCKED: hstore[] subtype + missing schema column.
      // The pg_arrays table created above omits the `hstores hstore[]` column (needs the
      // hstore extension), and OID::HStore is not wired as an array element subtype, so
      // an `hstore[]` column would not deserialize to per-element hash objects. Both the
      // hstore-extension table setup and the array-of-hstore OID wiring are prerequisites.
    });
    it.skip("datetime with timezone awareness", async () => {
      // BLOCKED: TimeZone infra + missing schema column.
      // The pg_arrays table above omits the `datetimes datetime[]` column, and the
      // timestamp/datetime array subtype does not respect ActiveSupport::TimeZone when
      // casting elements (`in_time_zone` / `Time.zone` not ported). Requires the TimeZone
      // registry port — defer to a dedicated timezone PR.
    });
    it("assigning non array value", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
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
      class PgArrays extends Base {
        static tableName = "pg_arrays";
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
      class PgArrays extends Base {
        static tableName = "pg_arrays";
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

    it("uniqueness validation", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.validatesUniqueness("tags");
        }
      }
      await PgArrays.loadSchema();

      const tags = ["black", "blue"];
      // Rails: e1 = klass.create("tags" => ["black", "blue"]); assert_predicate e1, :persisted?
      const e1 = await (PgArrays as any).create({ tags });
      expect((e1 as any).isPersisted()).toBe(true);

      // Rails: e2 = klass.create("tags" => ["black", "blue"]); assert_not e2.persisted?
      const e2 = await (PgArrays as any).create({ tags });
      expect((e2 as any).isPersisted()).toBe(false);
      // Rails: assert_equal ["has already been taken"], e2.errors[:tags]
      expect((e2 as any).errors.where("tags").map((e: any) => e.message)).toEqual([
        "has already been taken",
      ]);
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
