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
  let HstoreModel: any;

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
    await adapter.loadAdditionalTypes();
    const { Base } = await import("../../index.js");
    class HstoreModelCls extends Base {
      static tableName = "hstores";
      static {
        this.adapter = adapter;
      }
    }
    await HstoreModelCls.loadSchema();
    HstoreModel = HstoreModelCls;
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS hstores`);
    await adapter.close();
  });

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
      // BLOCKED: schema-statements — add_column with hstore default not yet wired
      // ROOT-CAUSE: postgresql/schema-statements.ts addColumn does not call columnDefaults
      //   to resolve hstore defaults via the OID type map.
      // SCOPE: ~10 LOC in schema-statements.ts; add columnDefaults support for hstore columns.
    });
    it.skip("change column default with hstore", async () => {
      // BLOCKED: schema-statements — changeColumnDefault for hstore-typed columns
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

    it.skip("hstore with store accessors", async () => {
      // BLOCKED: store-accessor — Base.store_accessor not implemented
      // ROOT-CAUSE: store_accessor in base.ts does not generate per-key getters/setters that
      //   read/write sub-keys of a hstore attribute.
      // SCOPE: ~50 LOC in base.ts; pairs with the store DSL.
    });
    it.skip("hstore dirty tracking", async () => {
      // BLOCKED: test-name mismatch — no Rails test named "hstore dirty tracking" in hstore_test.rb
      // ROOT-CAUSE: Placeholder with no Rails reference; cannot port faithfully.
      // SCOPE: Permanent skip-list candidate.
    });
    it.skip("hstore duplication", async () => {
      // BLOCKED: test-name mismatch — no Rails test named "hstore duplication" in hstore_test.rb
      // ROOT-CAUSE: Closest Rails match is test_duplication_with_store_accessors (store_accessor blocked).
      // SCOPE: Permanent skip-list candidate.
    });
    it.skip("hstore mutate", async () => {
      // BLOCKED: dirty-tracking — Attribute.changedInPlace() does not delegate to type.isChangedInPlace()
      // ROOT-CAUSE: activemodel/src/attribute.ts FromDatabase.changedInPlace() returns false
      //   unconditionally; it must call this.type.isChangedInPlace(originalValueForDatabase, value)
      //   for mutable types (those with isMutable()=true) so in-place hash mutations are detected.
      // SCOPE: ~5 LOC in activemodel/src/attribute.ts; unblocks all "changes in place" / mutate tests.
    });
    it.skip("hstore nested", async () => {
      // BLOCKED: test-name mismatch — no Rails test named "hstore nested" in hstore_test.rb
      // ROOT-CAUSE: No Rails reference; cannot port faithfully.
      // SCOPE: Permanent skip-list candidate.
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
      // BLOCKED: test-name mismatch — no Rails test named "hstore populate" in hstore_test.rb
      // ROOT-CAUSE: No Rails reference; populate_record() is PG SQL, not an AR API.
      // SCOPE: Permanent skip-list candidate.
    });
    it.skip("hstore schema dump", async () => {
      // BLOCKED: test-name mismatch — no Rails test named "hstore schema dump" in hstore_test.rb
      // ROOT-CAUSE: Closest Rails test is "schema dump with shorthand".
      // SCOPE: Permanent skip-list candidate.
    });
    it.skip("hstore migration", async () => {
      // BLOCKED: migration — Base.migration API not implemented for hstore column type
      // ROOT-CAUSE: Migration.current + change_table DSL missing; t.hstore(:keys) not wired.
      // SCOPE: ~30 LOC in migration.ts; unblocked after Wave 8 PR 46c.
    });
    it.skip("hstore gen random uuid", async () => {
      // BLOCKED: test-name mismatch — not in hstore_test.rb; permanent skip-list candidate.
    });
    it.skip("hstore gen random uuid default", async () => {
      // BLOCKED: test-name mismatch — not in hstore_test.rb; permanent skip-list candidate.
    });
    it.skip("hstore fixture", async () => {
      // BLOCKED: test-name mismatch — no Rails test named "hstore fixture" in hstore_test.rb
      // ROOT-CAUSE: Rails fixtures are a test infrastructure feature with no direct TS port.
      // SCOPE: Permanent skip-list candidate.
    });

    it("hstore included in extensions", async () => {
      const rows = await adapter.execute(
        `SELECT extname FROM pg_extension WHERE extname = 'hstore'`,
      );
      expect(rows).toHaveLength(1);
    });

    it.skip("disable enable hstore", () => {
      // BLOCKED: schema-statements — enableExtension/disableExtension not implemented
      // ROOT-CAUSE: adapter does not expose enableExtension("hstore") / disableExtension("hstore");
      //   Rails uses `@connection.enable_extension` / `@connection.disable_extension`.
      // SCOPE: ~20 LOC in connection-adapters/postgresql/schema-statements.ts.
    });
    it.skip("change table supports hstore", () => {
      // BLOCKED: schema-statements — changeTable t.hstore not wired
      // ROOT-CAUSE: change_table DSL in schema-statements.ts does not register hstore as a column
      //   type that can be added via t.hstore(...).
      // SCOPE: ~10 LOC in schema-statements.ts; pairs with hstore migration support.
    });
    it.skip("cast value on write", () => {
      // BLOCKED: attribute-methods — readAttributeBeforeTypeCast not implemented
      // ROOT-CAUSE: Rails test asserts `x.tags_before_type_cast` returns the pre-cast hash
      //   ({ "bool" => true, "number" => 5 }); we have no readAttributeBeforeTypeCast accessor.
      //   The save/reload assertions themselves would pass; only the before-type-cast step is blocked.
      // SCOPE: ~20 LOC in attribute-methods/read.ts; affects all `_before_type_cast` tests.
    });
    it.skip("with store accessors", () => {
      // BLOCKED: store-accessor — Base.store_accessor not implemented
      // ROOT-CAUSE: store_accessor in base.ts does not generate per-key getters/setters that
      //   read/write sub-keys of a hstore attribute.
      // SCOPE: ~50 LOC in base.ts; pairs with the store DSL.
    });
    it.skip("duplication with store accessors", () => {
      // BLOCKED: store-accessor — same as "with store accessors"
      // ROOT-CAUSE: store_accessor must generate getters/setters before dup can propagate them.
      // SCOPE: ~50 LOC in base.ts (store_accessor) + verify dup copies attribute hash.
    });
    it.skip("yaml round trip with store accessors", () => {
      // BLOCKED: serialization — Ruby YAML/Marshal round-trip, no Node.js equivalent
      // ROOT-CAUSE: Node.js has no YAML.dump/Marshal.dump for ActiveRecord instances.
      // SCOPE: Permanent skip-list candidate; no faithful port is possible.
    });
    it.skip("changes with store accessors", () => {
      // BLOCKED: store-accessor + dirty-tracking — both gaps must close first
      // ROOT-CAUSE: (1) store_accessor not implemented; (2) Attribute.changedInPlace() does not
      //   call type.isChangedInPlace() for mutable types.
      // SCOPE: ~50 LOC store_accessor + ~5 LOC attribute.ts changedInPlace delegation.
    });
    it.skip("changes in place", () => {
      // BLOCKED: dirty-tracking — Attribute.changedInPlace() does not delegate to type.isChangedInPlace()
      // ROOT-CAUSE: activemodel/src/attribute.ts FromDatabase.changedInPlace() returns false
      //   unconditionally; Rails calls type.changed_in_place?(original_value_for_database, value).
      //   Hstore.isChangedInPlace() is implemented but never called by the Attribute layer.
      // SCOPE: ~5 LOC in activemodel/src/attribute.ts FromDatabase subclass.
    });
    it.skip("dirty from user equal", () => {
      // BLOCKED: dirty-tracking — same Attribute.changedInPlace() gap as "changes in place"
      // ROOT-CAUSE: After reassigning an attribute with a deep-equal hash, the dirty tracker
      //   must call type.isChangedInPlace() to detect equality; currently it compares by identity.
      // SCOPE: ~5 LOC in activemodel/src/attribute.ts FromDatabase.changedInPlace().
    });
    it.skip("hstore dirty from database equal", () => {
      // BLOCKED: dirty-tracking — same Attribute.changedInPlace() gap as "changes in place"
      // ROOT-CAUSE: After reload + reassign with same hash, dirty must be false; requires
      //   Attribute.changedInPlace() → type.isChangedInPlace() delegation to detect equality.
      // SCOPE: ~5 LOC in activemodel/src/attribute.ts FromDatabase.changedInPlace().
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
      // BLOCKED: serialize-coder — Base.serialize({ coder: ... }) not implemented
      // ROOT-CAUSE: Rails wraps the hstore attribute with a coder that implements .load/.dump;
      //   Base.serialize(col, coder:) in base.ts does not wire the encode/decode lifecycle.
      // SCOPE: ~50 LOC in base.ts serialize decorator + integration with attribute-set lifecycle.
    });
    it.skip("clone hstore with serialized attributes", () => {
      // BLOCKED: serialize-coder — same as "hstore with serialized attributes"
      // ROOT-CAUSE: dup/clone of a coder-wrapped hstore also needs the coder path wired.
      // SCOPE: Unblocked automatically once "hstore with serialized attributes" passes.
    });
    it.skip("supports to unsafe h values", () => {
      // BLOCKED: Ruby-specific — ActionController::Parameters#to_unsafe_h has no Node.js equivalent
      // ROOT-CAUSE: Rails' ProtectedParams (ActionController::Parameters) exposes to_unsafe_h;
      //   there is no TS equivalent. The test verifies that hstore.serialize() accepts such objects.
      // SCOPE: Implement a ProtectedParams TS stub that exposes toUnsafeH() + wire in hstore.serialize().
      //   Alternatively treat as a permanent skip if ActionController is out of scope.
    });

    it("select", async () => {
      await adapter.execute(`INSERT INTO hstores (tags) VALUES ('1=>2')`);
      const x = await HstoreModel.first();
      expect((x as any).tags).toEqual({ "1": "2" });
    });

    it("contains nils", async () => {
      await assertArrayCycle([{ NULL: null }]);
    });

    it.skip("schema dump with shorthand", async () => {
      // BLOCKED: schema-dumper — SchemaDumper does not emit t.hstore(...) for hstore columns
      // ROOT-CAUSE: schema-dumper.ts maps column types to t.type() calls but does not have a
      //   shorthand mapping for hstore; it would emit a generic t.column() instead of t.hstore().
      //   Rails expects: `t.hstore "tags", default: {}`.
      // SCOPE: ~10 LOC in schema-dumper.ts; add hstore→"hstore" type-name mapping.
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
