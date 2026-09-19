import { Rational } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base, ColumnNotSerializableError, StatementInvalid } from "../../index.js";
import { TimeZone, setZone, change as timeChange } from "@blazetrails/activesupport";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Array as OidArray } from "../../connection-adapters/postgresql/oid/array.js";
import { ValueType, ModelName } from "@blazetrails/activemodel";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

const textArray = new OidArray(new ValueType());

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

fixtures([]);

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await adapter.execute(`DROP TABLE IF EXISTS pg_arrays`);
    await adapter.execute(`CREATE EXTENSION IF NOT EXISTS hstore`);
    await adapter.execute(`
      CREATE TABLE pg_arrays (
        id serial primary key,
        tags character varying(255)[],
        ratings integer[],
        datetimes timestamp(6)[],
        hstores hstore[],
        decimals numeric(10,2)[] DEFAULT '{}',
        timestamps timestamp(6)[] DEFAULT '{}'
      )
    `);
    await adapter.loadAdditionalTypes();
  });
  afterEach(() => {
    (
      adapter as unknown as {
        internalSchemaCache: { clearDataSourceCacheBang(connection: unknown, name: string): void };
      }
    ).internalSchemaCache.clearDataSourceCacheBang(null, "pg_arrays");
  });
  afterAll(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS pg_arrays`).catch(() => {});
  });
  describe("PostgresqlArrayTest", () => {
    class PgArray extends Base {
      declare tags: any;
      declare ratings: any;
      static tableName = "pg_arrays";
    }
    let column: any;
    let type: any;
    beforeEach(async () => {
      await PgArray.resetColumnInformation();
      await PgArray.loadSchema();
      column = PgArray.columnsHash()["tags"];
      type = PgArray.typeForAttribute("tags");
    });
    it("column", async () => {
      expect(column.type).toBe("string");
      expect(column.sqlType).toBe("character varying(255)");
      expect(column.isArray()).toBeTruthy();
      expect(type.isBinary()).toBeFalsy();

      const ratingsColumn = PgArray.columnsHash()["ratings"] as any;
      expect(ratingsColumn.type).toBe("integer");
      expect(ratingsColumn.isArray()).toBeTruthy();
    });
    it("not compatible with serialize array", async () => {
      class PgArrayNotSerializable extends Base {
        static tableName = "pg_arrays";
      }
      await PgArrayNotSerializable.loadSchema();
      expect(() => {
        PgArrayNotSerializable.serialize("tags", { type: Array });
        new PgArrayNotSerializable();
      }).toThrow(ColumnNotSerializableError);
    });
    it("array with serialized attributes", async () => {
      class MyTags {
        constructor(public tags: string[]) {}
        toArray(): string[] {
          return this.tags;
        }
        static load(tags: unknown): MyTags {
          return new MyTags(
            Array.isArray(tags) ? (tags as string[]) : tags == null ? [] : [String(tags)],
          );
        }
        static dump(object: unknown): unknown {
          return object instanceof MyTags ? object.toArray() : object;
        }
      }
      class PgArraySerialized extends Base {
        declare tags: any;
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArraySerialized.loadSchema();
      PgArraySerialized.serialize("tags", { coder: MyTags });

      await PgArraySerialized.create({ tags: new MyTags(["one", "two"]) } as any);
      const record = (await PgArraySerialized.first())!;
      expect(record.tags).toBeInstanceOf(MyTags);
      expect((record.tags as MyTags).toArray()).toEqual(["one", "two"]);

      (record as any).tags = new MyTags(["three", "four"]);
      await record.save();
      await (record as any).reload();
      expect((record.tags as MyTags).toArray()).toEqual(["three", "four"]);
    });
    it("default", async () => {
      await adapter.addColumn("pg_arrays", "score", "integer", { array: true, default: [4, 4, 2] });
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      try {
        await PgArrays.resetColumnInformation();
        expect((PgArrays as any).columnDefaults["score"]).toEqual([4, 4, 2]);
        expect((new PgArrays() as any).score).toEqual([4, 4, 2]);
      } finally {
        void PgArrays.resetColumnInformation();
      }
    });
    it("default strings", async () => {
      await adapter.addColumn("pg_arrays", "names", "string", {
        array: true,
        default: ["foo", "bar"],
      });
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      try {
        await PgArrays.resetColumnInformation();
        expect((PgArrays as any).columnDefaults["names"]).toEqual(["foo", "bar"]);
        expect((new PgArrays() as any).names).toEqual(["foo", "bar"]);
      } finally {
        void PgArrays.resetColumnInformation();
      }
    });
    it("schema dump with shorthand", async () => {
      const output = await dumpTableSchema(adapter, "pg_arrays");
      expect(output).toMatch(/t\.string\("tags",\s+\{ limit: 255,\s+array: true/);
      expect(output).toMatch(/t\.integer\("ratings",\s+\{ array: true/);
      expect(output).toMatch(
        /t\.decimal\("decimals",\s+\{ precision: 10,\s+scale: 2,\s+default: \[\],\s+array: true/,
      );
    });
    it("schema dump renders non-empty array defaults via the element type", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS pg_array_defaults`);
      await adapter.execute(`
        CREATE TABLE pg_array_defaults (
          id serial primary key,
          ints integer[] DEFAULT '{4,4,2}',
          flags boolean[] DEFAULT '{true,false}',
          nums numeric(10,2)[] DEFAULT '{1.5,2.5}'
        )
      `);
      await adapter.loadAdditionalTypes();
      try {
        const output = await dumpTableSchema(adapter, "pg_array_defaults");
        const line = (name: string) => output.split("\n").find((l) => l.includes(`"${name}"`))!;
        expect(line("ints")).toMatch(/default: \[4, 4, 2\]/);
        expect(line("flags")).toMatch(/default: \[true, false\]/);
        expect(line("nums")).toMatch(/default: \["1\.5", "2\.5"\]/);
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS pg_array_defaults`).catch(() => {});
      }
    });
    it("change column with array", async () => {
      await adapter.addColumn("pg_arrays", "snippets", "string", { array: true, default: [] });
      await adapter.changeColumn("pg_arrays", "snippets", "text", { array: true, default: [] });
      await PgArray.resetColumnInformation();
      const column = PgArray.columnsHash()["snippets"] as any;
      expect(column.type).toBe("text");
      expect((PgArray as any).columnDefaults["snippets"]).toEqual([]);
      expect(column.isArray()).toBeTruthy();
    });
    it("change column from non array to array", async () => {
      await adapter.addColumn("pg_arrays", "snippets", "string");
      await adapter.changeColumn("pg_arrays", "snippets", "text", {
        array: true,
        default: [],
        using: `string_to_array("snippets", ',')`,
      });
      await PgArray.resetColumnInformation();
      const column = PgArray.columnsHash()["snippets"] as any;
      expect(column.type).toBe("text");
      expect((PgArray as any).columnDefaults["snippets"]).toEqual([]);
      expect(column.isArray()).toBeTruthy();
    });
    it("change column cant make non array column to array", async () => {
      await adapter.addColumn("pg_arrays", "a_string", "string");
      await expect(
        adapter.transaction(async () => {
          await adapter.changeColumn("pg_arrays", "a_string", "string", { array: true });
        }),
      ).rejects.toThrow(StatementInvalid);
    });
    it("change column default with array", async () => {
      await adapter.changeColumnDefault("pg_arrays", "tags", []);
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArrays.resetColumnInformation();
      expect((PgArrays as any).columnDefaults["tags"]).toEqual([]);
    });

    it("type cast array", async () => {
      expect(type.deserialize("{1,2,3}")).toEqual(["1", "2", "3"]);
      expect(type.deserialize("{}")).toEqual([]);
      expect(type.deserialize("{NULL}")).toEqual([null]);
    });

    it("type cast integers", async () => {
      const x = new PgArray({ ratings: ["1", "2"] } as any);

      expect(x.ratings).toEqual([1, 2]);

      await x.saveBang();
      await x.reload();

      expect(x.ratings).toEqual([1, 2]);
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
      await adapter.execQuery(
        `UPDATE pg_arrays SET tags = '{"1","2","3","4"}' WHERE id = $1`,
        "SQL",
        [id],
      );
      const updated = (
        await adapter.execQuery(`SELECT tags FROM pg_arrays WHERE id = $1`, "SQL", [id])
      ).toArray();
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
      await adapter.execQuery(`UPDATE pg_arrays SET ratings = '{2,3,4}' WHERE id = $1`, "SQL", [
        id,
      ]);
      const updated = (
        await adapter.execQuery(`SELECT ratings FROM pg_arrays WHERE id = $1`, "SQL", [id])
      ).toArray();
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
        static {
          this.attribute("id", "integer");
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
      await r.reload();
      expect(r.tags).toEqual(arr);
    });

    it("with arbitrary whitespace", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
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
      await r.reload();
      expect(r.tags).toEqual(arr);
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
      await adapter.execQuery(`INSERT INTO pg_arrays (tags) VALUES ($1)`, "SQL", [
        textArray.serialize(tags),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it("strings with commas", async () => {
      const tags = ["this,has", "many,values"];
      await adapter.execQuery(`INSERT INTO pg_arrays (tags) VALUES ($1)`, "SQL", [
        textArray.serialize(tags),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it("strings with array delimiters", async () => {
      const tags = ["{", "}"];
      await adapter.execQuery(`INSERT INTO pg_arrays (tags) VALUES ($1)`, "SQL", [
        textArray.serialize(tags),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it("strings with null strings", async () => {
      const tags = ["NULL", "NULL"];
      await adapter.execQuery(`INSERT INTO pg_arrays (tags) VALUES ($1)`, "SQL", [
        textArray.serialize(tags),
      ]);
      const rows = await adapter.execute(`SELECT tags FROM pg_arrays`);
      expect(rows[0].tags).toEqual(tags);
    });

    it("insert fixture", async () => {
      const tagValues = ["val1", "val2", "val3_with_'_multiple_quote_'_chars"];
      await (adapter as any).insertFixture({ tags: tagValues }, "pg_arrays");
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArrays.loadSchema();
      const last = await (PgArrays as any).last();
      expect(last.tags).toEqual(tagValues);
    });
    it("attribute for inspect for array field", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
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
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
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
      await adapter.execQuery(`INSERT INTO pg_arrays (tags) VALUES ($1)`, "SQL", [
        textArray.serialize(tags),
      ]);
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
      const x = await PgArray.createBang({ tags } as any);
      await x.reload();

      expect(x.isChanged).toBeFalsy();
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
      expect(adapter.typeCast(commaDelim.serialize(strings))).toBe('{"hello,",world;}');
      expect(adapter.typeCast(semicolonDelim.serialize(strings))).toBe('{hello,;"world;"}');
    });

    it("mutate array", async () => {
      const x = await PgArray.createBang({ tags: ["one", "two"] } as any);

      x.tags.push("three");
      await x.saveBang();
      await x.reload();

      expect(x.tags).toEqual(["one", "two", "three"]);
      expect(x.isChanged).toBeFalsy();
    });

    it("mutate value in array", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArrays.loadSchema();
      const x = await (PgArrays as any).create({
        hstores: [{ a: "a" }, { b: "b" }],
      });
      x.hstores[0]["a"] = "c";
      await x.save();
      await x.reload();
      expect(x.hstores).toEqual([{ a: "c" }, { b: "b" }]);
      expect(x.isChanged).toBeFalsy();
    });
    it("datetime with timezone awareness", async () => {
      const tz = "Pacific Time (US & Canada)";
      const zone = TimeZone.find(tz)!;
      setZone(tz);
      try {
        class PgArrays extends Base {
          static tableName = "pg_arrays";
          static timeZoneAwareAttributes = true;
          static {
            this.attribute("id", "integer");
          }
        }
        await PgArrays.loadSchema();
        const timeString = "2020-06-15T10:00:00-07:00";
        const time = zone.parse(timeString);

        const record = new PgArrays({ datetimes: [timeString] } as any);
        expect((record as any).datetimes).toEqual([time]);
        expect((record as any).datetimes[0].timeZone).toEqual(zone);

        await (record as any).saveBang();
        await (record as any).reload();

        expect((record as any).datetimes).toEqual([time]);
        expect((record as any).datetimes[0].timeZone).toEqual(zone);
      } finally {
        setZone(null);
      }
    });
    it("assigning non array value", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArrays.loadSchema();
      const record = new PgArrays({ tags: "not-an-array" } as any);
      expect((record as any).tags).toEqual([]);
      expect((record as any).attributeBeforeTypeCast("tags")).toBe("not-an-array");
      expect(await record.save()).toBeTruthy();
      expect((record as any).tags).toEqual(((await record.reload()) as any).tags);
    });
    it("assigning empty string", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArrays.loadSchema();
      const record = new PgArrays({ tags: "" } as any);
      expect((record as any).tags).toEqual([]);
      expect((record as any).attributeBeforeTypeCast("tags")).toBe("");
      expect(await record.save()).toBeTruthy();
      expect((record as any).tags).toEqual(((await record.reload()) as any).tags);
    });
    it("assigning valid pg array literal", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArrays.loadSchema();
      const record = new PgArrays({ tags: "{1,2,3}" } as any);
      expect((record as any).tags).toEqual(["1", "2", "3"]);
      expect((record as any).attributeBeforeTypeCast("tags")).toBe("{1,2,3}");
      expect(await record.save()).toBeTruthy();
      expect((record as any).tags).toEqual(((await record.reload()) as any).tags);
    });

    it("where by attribute with array", async () => {
      const tags = ["black", "blue"];
      const record = await PgArray.createBang({ tags } as any);
      expect(((await PgArray.where({ tags }).take()) as any).id).toEqual(record.id);
    });

    it("uniqueness validation", async () => {
      class Klass extends PgArray {
        static {
          this.validatesUniquenessOf("tags");
        }
        static override get modelName() {
          return new ModelName(PgArray.name);
        }
      }
      const e1 = await Klass.create({ tags: ["black", "blue"] } as any);
      expect(e1.isPersisted(), "Saving e1").toBeTruthy();

      const e2 = await Klass.create({ tags: ["black", "blue"] } as any);
      expect(e2.isPersisted(), "e2 shouldn't be valid").toBeFalsy();
      expect(e2.errors.get("tags").length > 0, "Should have errors for tags").toBeTruthy();
      expect(e2.errors.get("tags"), "Should have uniqueness message for tags").toEqual([
        "has already been taken",
      ]);
    });

    it("encoding arrays of utf8 strings", async () => {
      const arraysOfUtf8Strings = ["nový", "ファイル"];
      expect(type.deserialize(type.serialize(arraysOfUtf8Strings))).toEqual(arraysOfUtf8Strings);
      expect(type.deserialize(type.serialize([arraysOfUtf8Strings]))).toEqual([
        arraysOfUtf8Strings,
      ]);
    });

    it("precision is respected on timestamp columns", async () => {
      const time = timeChange(RubyTime.now(), { usec: 123 });
      const record = await PgArray.createBang({ timestamps: [time] } as any);

      expect((record as any).timestamps[0].usec).toBe(123);
      await record.reload();
      expect((record as any).timestamps[0].usec).toBe(123);
    });
  });

  describe("array datetime inline-quoting (trails)", () => {
    it("inlines a proleptic-year datetime[] element as a quoted_date BC literal", async () => {
      class PgArrays extends Base {
        static tableName = "pg_arrays";
        static {
          this.attribute("id", "integer");
        }
      }
      await PgArrays.loadSchema();
      const bc = Temporal.Instant.from("-000042-03-15T12:34:56.123456Z");
      const record = await (PgArrays as any).create({ datetimes: [bc] });
      await record.reload();
      expect(record.datetimes).toHaveLength(1);
      expect(
        (record.datetimes[0] as RubyTime)
          .toR()
          .cmp(new Rational(bc.epochNanoseconds, 1_000_000_000n)),
      ).toBe(0);
    });
  });
});
