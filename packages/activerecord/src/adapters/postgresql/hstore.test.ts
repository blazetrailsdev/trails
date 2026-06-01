/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/hstore_test.rb
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import {
  Hstore,
  parseHstore,
  serializeHstore,
} from "../../connection-adapters/postgresql/oid/hstore.js";
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

// The `hstores` table uses the PG-specific `hstore` type, which isn't
// expressible via defineSchema. The table is created via raw DDL below;
// defineSchema({}) marks the file as TM-Phase-5 compliant.
setupHandlerSuite();
useHandlerTransactionalFixtures();

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let HstoreModel: any;

  beforeAll(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await defineSchema({});
    await adapter.exec(`CREATE EXTENSION IF NOT EXISTS hstore`);
    await adapter.exec(`DROP TABLE IF EXISTS hstores`);
    await adapter.exec(`
      CREATE TABLE hstores (
        id serial primary key,
        tags hstore DEFAULT '',
        payload hstore[],
        settings hstore
      )
    `);
    await adapter.loadAdditionalTypes();
    class HstoreModelCls extends Base {
      static tableName = "hstores";
    }
    await HstoreModelCls.loadSchema();
    HstoreModel = HstoreModelCls;
  });

  afterAll(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS hstores`);
  });
  async function freshStoreAccessorModel(a: PostgreSQLAdapter): Promise<any> {
    class HstoreWithAccessors extends Base {
      static tableName = "hstores";
      static {
        this.adapter = a;
        this.storeAccessor("settings", { accessors: ["language", "timezone"] });
      }
    }
    await HstoreWithAccessors.loadSchema();
    return HstoreWithAccessors;
  }

  async function assertArrayCycle(array: Array<Record<string, string | null>>): Promise<void> {
    const x = await HstoreModel.createBang({ payload: array });
    await (x as any).reload();
    expect((x as any).payload).toEqual(array);
    const y = await HstoreModel.createBang({ payload: [] });
    (y as any).payload = array;
    await (y as any).saveBang();
    await (y as any).reload();
    expect((y as any).payload).toEqual(array);
  }

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
      // BLOCKED: schema — add_column with hstore default not yet wired
      // ROOT-CAUSE: postgresql/schema-statements.ts addColumn does not call columnDefaults
      //   to resolve hstore defaults via the OID type map.
      // SCOPE: ~10 LOC in schema-statements.ts; add columnDefaults support for hstore columns.
    });
    it.skip("change column default with hstore", async () => {
      // BLOCKED: schema — changeColumnDefault for hstore-typed columns
      // ROOT-CAUSE: changeColumnDefault in schema-statements.ts passes the value through quoteDefault
      //   without serializing hstore objects first.
      // SCOPE: ~10 LOC in connection-adapters/postgresql/schema-statements.ts.
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

    it("hstore mutate", async () => {
      const hstore = await HstoreModel.createBang({ settings: { one: "two" } });
      (hstore as any).settings.three = "four";
      await (hstore as any).saveBang();
      // Post-save baseline must be reset: changedInPlace() should be false
      // without a reload, meaning a second save won't fire a spurious UPDATE.
      expect((hstore as any)._attributes.getAttribute("settings").changedInPlace()).toBe(false);
      await (hstore as any).reload();
      expect((hstore as any).settings.three).toBe("four");
      expect((hstore as any).changed).toBe(false);
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
      // adapter.execute returns raw strings for json columns; Json#deserialize owns parsing
      expect(JSON.parse(rows[0].r as string)).toEqual({ a: "1", b: "2" });
    });
    it.skip("hstore migration", async () => {
      // BLOCKED: migration — Base.migration API not implemented for hstore column type
      // ROOT-CAUSE: Migration.current + change_table DSL missing; t.hstore(:keys) not wired.
      // SCOPE: ~30 LOC in migration.ts; unblocked after Wave 8 PR 46c.
    });
    it("hstore included in extensions", async () => {
      const rows = await adapter.execute(
        `SELECT extname FROM pg_extension WHERE extname = 'hstore'`,
      );
      expect(rows).toHaveLength(1);
    });

    it.skip("disable enable hstore", () => {
      // BLOCKED: schema — enableExtension/disableExtension not implemented
      // ROOT-CAUSE: adapter does not expose enableExtension("hstore") / disableExtension("hstore");
      //   Rails uses `@connection.enable_extension` / `@connection.disable_extension`.
      // SCOPE: ~20 LOC in connection-adapters/postgresql/schema-statements.ts.
    });
    it.skip("change table supports hstore", () => {
      // BLOCKED: schema — changeTable t.hstore not wired
      // ROOT-CAUSE: change_table DSL in schema-statements.ts does not register hstore as a column
      //   type that can be added via t.hstore(...).
      // SCOPE: ~10 LOC in schema-statements.ts; pairs with hstore migration support.
    });
    it("cast value on write", async () => {
      const x = HstoreModel.new({ tags: { bool: true, number: 5 } });
      expect((x as any).tagsBeforeTypeCast).toEqual({ bool: true, number: 5 });
      expect((x as any).tags).toEqual({ bool: "true", number: "5" });
      await (x as any).save();
      await (x as any).reload();
      expect((x as any).tags).toEqual({ bool: "true", number: "5" });
    });
    it("with store accessors", async () => {
      const HstoreWithAccessors = await freshStoreAccessorModel(adapter);
      const x = HstoreWithAccessors.new({ language: "fr", timezone: "GMT" });
      expect((x as any).language).toBe("fr");
      expect((x as any).timezone).toBe("GMT");

      await (x as any).saveBang();
      const y = await HstoreWithAccessors.first();
      expect((y as any).language).toBe("fr");
      expect((y as any).timezone).toBe("GMT");

      (y as any).language = "de";
      await (y as any).saveBang();

      const z = await HstoreWithAccessors.first();
      expect((z as any).language).toBe("de");
      expect((z as any).timezone).toBe("GMT");
    });
    it("duplication with store accessors", async () => {
      const HstoreWithAccessors = await freshStoreAccessorModel(adapter);
      const x = HstoreWithAccessors.new({ language: "fr", timezone: "GMT" });
      expect((x as any).language).toBe("fr");
      expect((x as any).timezone).toBe("GMT");

      const y = (x as any).dup();
      expect((y as any).language).toBe("fr");
      expect((y as any).timezone).toBe("GMT");
    });
    it.skip("yaml round trip with store accessors", () => {
      // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
      // Node.js has no YAML.dump/Marshal.dump for ActiveRecord instances.
    });
    it("changes with store accessors", async () => {
      const HstoreWithAccessors = await freshStoreAccessorModel(adapter);
      const x = HstoreWithAccessors.new({ language: "de" });
      expect((x as any).languageChanged()).toBe(true);
      expect((x as any).languageWas()).toBeNull();
      expect((x as any).languageChange()).toEqual([null, "de"]);
      await (x as any).saveBang();

      expect((x as any).languageChanged()).toBe(false);
      await (x as any).reload();

      (x as any).settings = null;
      expect((x as any).languageChanged()).toBe(true);
      expect((x as any).languageWas()).toBe("de");
      expect((x as any).languageChange()).toEqual(["de", null]);
    });
    it("saved changes with store accessors", async () => {
      const HstoreWithAccessors = await freshStoreAccessorModel(adapter);
      const x = HstoreWithAccessors.new({ language: "fr" });
      await (x as any).saveBang();

      // After save: previousChanges has [nil, {language: "fr"}] for settings.
      expect((x as any).savedChangeToLanguage()).toBe(true);
      expect((x as any).savedChangeToLanguageValues()).toEqual([null, "fr"]);
      expect((x as any).languageBeforeLastSave()).toBeNull();

      (x as any).language = "de";
      await (x as any).saveBang();
      expect((x as any).savedChangeToLanguage()).toBe(true);
      expect((x as any).savedChangeToLanguageValues()).toEqual(["fr", "de"]);
      expect((x as any).languageBeforeLastSave()).toBe("fr");
    });
    it("changes in place", async () => {
      const hstore = await HstoreModel.createBang({ settings: { one: "two" } });
      (hstore as any).settings["three"] = "four";
      await (hstore as any).saveBang();
      await (hstore as any).reload();

      expect((hstore as any).settings["three"]).toBe("four");
      expect((hstore as any).changed).toBe(false);
    });
    it("dirty from user equal", async () => {
      const settings = { alongkey: "anything", key: "value" };
      const hstore = await HstoreModel.createBang({ settings });
      (hstore as any).settings = { key: "value", alongkey: "anything" };
      expect((hstore as any).settings).toEqual(settings);
      expect((hstore as any).changed).toBe(false);
    });
    it("hstore dirty from database equal", async () => {
      const settings = { alongkey: "anything", key: "value" };
      const hstore = await HstoreModel.createBang({ settings });
      await (hstore as any).reload();
      expect((hstore as any).settings).toEqual(settings);
      (hstore as any).settings = settings;
      expect((hstore as any).changed).toBe(false);
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

    it("array cycle", async () => {
      await assertArrayCycle([{ AA: "BB", CC: "DD" }, { AA: null }]);
    });
    it("array strings with quotes", async () => {
      await assertArrayCycle([{ "this has": 'some "s that need to be escaped"' }]);
    });
    it("array strings with commas", async () => {
      await assertArrayCycle([{ "this,has": "many,values" }]);
    });
    it("array strings with array delimiters", async () => {
      await assertArrayCycle([{ "{": "}" }]);
    });
    it("array strings with null strings", async () => {
      await assertArrayCycle([{ NULL: "NULL" }]);
    });
    it("select multikey", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ('1=>2,2=>3')`);
      const x = await HstoreModel.first();
      expect((x as any).tags).toEqual({ "1": "2", "2": "3" });
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
      // BLOCKED: serialization — serialize-coder: Base.serialize({ coder: ... }) not implemented
      // ROOT-CAUSE: Rails wraps the hstore attribute with a coder that implements .load/.dump;
      //   Base.serialize(col, coder:) in base.ts does not wire the encode/decode lifecycle.
      // SCOPE: ~50 LOC in base.ts serialize decorator + integration with attribute-set lifecycle.
    });
    it.skip("clone hstore with serialized attributes", () => {
      // BLOCKED: serialization — serialize-coder: same as "hstore with serialized attributes"
      // ROOT-CAUSE: dup/clone of a coder-wrapped hstore also needs the coder path wired.
      // SCOPE: Unblocked automatically once "hstore with serialized attributes" passes.
    });
    it.skip("supports to unsafe h values", () => {
      // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — protected-params
    });

    it("select", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ('1=>2')`);
      const x = await HstoreModel.first();
      expect((x as any).tags).toEqual({ "1": "2" });
    });

    it("contains nils", async () => {
      await assertArrayCycle([{ NULL: null }]);
    });

    it("schema dump with shorthand", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "hstores");
      expect(output).toMatch(/t\.hstore\("tags",\s*\{?\s*default:\s*\{\}/);
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
