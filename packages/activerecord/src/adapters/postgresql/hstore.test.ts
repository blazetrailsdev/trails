/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/hstore_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base, serialize } from "../../index.js";

// Rails: class TagCollection
class TagCollection {
  constructor(private readonly hash: Record<string, string | null>) {}
  toHash(): Record<string, string | null> {
    return this.hash;
  }
  static load(hash: unknown): TagCollection {
    return new TagCollection((hash ?? {}) as Record<string, string | null>);
  }
  static dump(value: unknown): unknown {
    return value instanceof TagCollection ? value.toHash() : value;
  }
}

// Rails: class Hstore < ActiveRecord::Base
//   self.table_name = "hstores"
//   store_accessor :settings, :language, :timezone
class Hstore extends Base {
  static {
    this.tableName = "hstores";
    this.storeAccessor("settings", { accessors: ["language", "timezone"] });
  }
}

// Rails: class HstoreWithSerialize < Hstore
//   serialize :tags, coder: TagCollection
class HstoreWithSerialize extends Hstore {}
serialize(HstoreWithSerialize, "tags", { coder: TagCollection });

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;
  let column: any;
  let type: any;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;

    // Rails: enable_extension!("hstore", @connection)
    await connection.enableExtension("hstore");

    // Rails: @connection.transaction { @connection.create_table("hstores") { |t| ... } }
    await connection.createTable("hstores", (t) => {
      t.column("tags", "hstore", { default: "" });
      t.column("payload", "hstore", { array: true });
      t.column("settings", "hstore");
    });

    // Rails: Hstore.reset_column_information
    Hstore.resetColumnInformation();
    await Hstore.loadSchema();
    HstoreWithSerialize.resetColumnInformation();
    await HstoreWithSerialize.loadSchema();

    // Rails: @column = Hstore.columns_hash["tags"]
    column = (Hstore as any).columnsHash()["tags"];
    // Rails: @type = Hstore.type_for_attribute("tags")
    type = Hstore.typeForAttribute("tags");
  });

  afterEach(async () => {
    // Rails: @connection.drop_table "hstores", if_exists: true
    await connection.dropTable("hstores", { ifExists: true });
    // Rails: disable_extension!("hstore", @connection)
    await connection.disableExtension("hstore", { force: "cascade" }).catch(() => {});
    Hstore.resetColumnInformation();
    HstoreWithSerialize.resetColumnInformation();
  });

  describe("PostgresqlHstoreTest", () => {
    // Rails: private def assert_cycle(hash)
    async function assertCycle(hash: Record<string, string | null>): Promise<void> {
      const x = await Hstore.createBang({ tags: hash });
      await (x as any).reload();
      expect((x as any).tags).toEqual(hash);
      const y = await Hstore.createBang({ tags: {} });
      (y as any).tags = hash;
      await (y as any).saveBang();
      await (y as any).reload();
      expect((y as any).tags).toEqual(hash);
    }

    // Rails: private def assert_array_cycle(array)
    async function assertArrayCycle(array: Array<Record<string, string | null>>): Promise<void> {
      const x = await Hstore.createBang({ payload: array });
      await (x as any).reload();
      expect((x as any).payload).toEqual(array);
      const y = await Hstore.createBang({ payload: [] });
      (y as any).payload = array;
      await (y as any).saveBang();
      await (y as any).reload();
      expect((y as any).payload).toEqual(array);
    }

    it("hstore included in extensions", async () => {
      expect(typeof connection.extensions).toBe("function");
      const exts = await connection.extensions();
      expect(exts).toContain("hstore");
    });

    it("disable enable hstore", async () => {
      expect(await connection.extensionEnabled("hstore")).toBe(true);
      await connection.disableExtension("hstore", { force: "cascade" });
      expect(await connection.extensionEnabled("hstore")).toBe(false);
      await connection.enableExtension("hstore");
      expect(await connection.extensionEnabled("hstore")).toBe(true);
    });

    it("column", async () => {
      expect(column.type).toBe("hstore");
      expect(column.sqlType).toBe("hstore");
      expect((column as any).array).toBeFalsy();
      // Rails: assert_not_predicate @type, :binary? — hstore is not a binary type
      expect(type.type()).not.toBe("binary");
    });

    it("default", async () => {
      await connection.addColumn("hstores", "permissions", "hstore", {
        default: '"users"=>"read", "articles"=>"write"',
      });
      // Rails: Hstore.reset_column_information (ensure block also resets)
      Hstore.resetColumnInformation();
      await Hstore.loadSchema();
      expect((Hstore as any).columnDefaults["permissions"]).toEqual({
        users: "read",
        articles: "write",
      });
      expect((Hstore.new() as any).permissions).toEqual({ users: "read", articles: "write" });
    });

    it("change table supports hstore", async () => {
      // Rails wraps in a transaction and raises ActiveRecord::Rollback to undo —
      // afterEach drops and recreates the table, so no manual rollback is needed.
      await connection.changeTable("hstores", async (t) => {
        await t.column("users", "hstore", { default: "" });
      });
      Hstore.resetColumnInformation();
      await Hstore.loadSchema();
      const col = (Hstore as any).columnsHash()["users"];
      expect(col.type).toBe("hstore");
    });

    it.skip("hstore migration", async () => {
      // BLOCKED: migration — Migration.current + change_table DSL; t.hstore(:keys) not wired.
      // SCOPE: ~30 LOC in migration.ts; unblocked after Wave 8.
    });

    it("cast value on write", async () => {
      const x = Hstore.new({ tags: { bool: true, number: 5 } });
      expect((x as any).tagsBeforeTypeCast).toEqual({ bool: true, number: 5 });
      expect((x as any).tags).toEqual({ bool: "true", number: "5" });
      await (x as any).save();
      await (x as any).reload();
      expect((x as any).tags).toEqual({ bool: "true", number: "5" });
    });

    it("type cast hstore", async () => {
      expect(type.deserialize('"1"=>"2"')).toEqual({ "1": "2" });
      expect(type.deserialize("")).toEqual({});
      await assertCycle({ key: null });
      await assertCycle({ c: "}", '"a"': 'b "a b' });
    });

    it("with store accessors", async () => {
      const x = Hstore.new({ language: "fr", timezone: "GMT" });
      expect((x as any).language).toBe("fr");
      expect((x as any).timezone).toBe("GMT");

      await (x as any).saveBang();
      const y = await Hstore.first();
      expect((y as any).language).toBe("fr");
      expect((y as any).timezone).toBe("GMT");

      (y as any).language = "de";
      await (y as any).saveBang();

      const z = await Hstore.first();
      expect((z as any).language).toBe("de");
      expect((z as any).timezone).toBe("GMT");
    });

    it("duplication with store accessors", async () => {
      const x = Hstore.new({ language: "fr", timezone: "GMT" });
      expect((x as any).language).toBe("fr");
      expect((x as any).timezone).toBe("GMT");

      const y = (x as any).dup();
      expect((y as any).language).toBe("fr");
      expect((y as any).timezone).toBe("GMT");
    });

    it.skip("yaml round trip with store accessors", () => {
      // PERMANENT-SKIP: Ruby-only — YAML.dump/Marshal.dump for ActiveRecord instances.
    });

    it("changes with store accessors", async () => {
      const x = Hstore.new({ language: "de" });
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

    it("changes in place", async () => {
      const hstore = await Hstore.createBang({ settings: { one: "two" } });
      (hstore as any).settings["three"] = "four";
      await (hstore as any).saveBang();
      await (hstore as any).reload();
      expect((hstore as any).settings["three"]).toBe("four");
      expect((hstore as any).changed).toBe(false);
    });

    it("dirty from user equal", async () => {
      const settings = { alongkey: "anything", key: "value" };
      const hstore = await Hstore.createBang({ settings });
      (hstore as any).settings = { key: "value", alongkey: "anything" };
      expect((hstore as any).settings).toEqual(settings);
      expect((hstore as any).changed).toBe(false);
    });

    it("hstore dirty from database equal", async () => {
      const settings = { alongkey: "anything", key: "value" };
      const hstore = await Hstore.createBang({ settings });
      await (hstore as any).reload();
      expect((hstore as any).settings).toEqual(settings);
      (hstore as any).settings = settings;
      expect((hstore as any).changed).toBe(false);
    });

    it("spaces", async () => {
      await assertCycle({ " ": " " });
    });

    it("commas", async () => {
      await assertCycle({ ",": "" });
    });

    it("signs", async () => {
      await assertCycle({ "=": ">" });
    });

    it("various null", async () => {
      await assertCycle({ a: null, b: null, c: "NuLl", null: "c" });
    });

    it("equal signs", async () => {
      await assertCycle({ "=a": "q=w" });
    });

    it("parse5", async () => {
      await assertCycle({ "=a": "q=w" });
    });

    it("parse6", async () => {
      await assertCycle({ '"a': "q>w" });
    });

    it("parse7", async () => {
      await assertCycle({ '"a': 'q"w' });
    });

    it("rewrite", async () => {
      await connection.execute("insert into hstores (tags) VALUES ('1=>2')");
      const x = await Hstore.first();
      (x as any).tags = { "\"a'": "b" };
      await (x as any).saveBang();
    });

    it("select", async () => {
      await connection.execute("insert into hstores (tags) VALUES ('1=>2')");
      const x = await Hstore.first();
      expect((x as any).tags).toEqual({ "1": "2" });
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

    it("contains nils", async () => {
      await assertArrayCycle([{ NULL: null }]);
    });

    it("select multikey", async () => {
      await connection.execute("insert into hstores (tags) VALUES ('1=>2,2=>3')");
      const x = await Hstore.first();
      expect((x as any).tags).toEqual({ "1": "2", "2": "3" });
    });

    it("create", async () => {
      await assertCycle({ a: "b", "1": "2" });
    });

    it("nil", async () => {
      await assertCycle({ a: null });
    });

    it("quotes", async () => {
      await assertCycle({ a: 'b"ar', '1"foo': "2" });
    });

    it("whitespace", async () => {
      await assertCycle({ "a b": "b ar", '1"foo': "2" });
    });

    it("backslash", async () => {
      await assertCycle({ "a\\b": "b\\ar", '1"foo': "2" });
      await assertCycle({ 'a\\"': "b\\ar", '1"foo': "2" });
      await assertCycle({ "a\\": "bar\\", '1"foo': "2" });
    });

    it("comma", async () => {
      await assertCycle({ "a, b": "bar", '1"foo': "2" });
    });

    it("arrow", async () => {
      await assertCycle({ "a=>b": "bar", '1"foo': "2" });
    });

    it("quoting special characters", async () => {
      await assertCycle({ ca: "cà", ac: "àc" });
    });

    it("multiline", async () => {
      await assertCycle({ "a\nb": "c\nd" });
    });

    it("hstore with serialized attributes", async () => {
      await HstoreWithSerialize.createBang({ tags: new TagCollection({ one: "two" }) });
      const record = (await HstoreWithSerialize.first())!;
      expect(record.tags).toBeInstanceOf(TagCollection);
      expect((record.tags as TagCollection).toHash()).toEqual({ one: "two" });
      (record as any).tags = new TagCollection({ three: "four" });
      await (record as any).saveBang();
      const reloaded = (await HstoreWithSerialize.first())!;
      expect((reloaded.tags as TagCollection).toHash()).toEqual({ three: "four" });
    });

    it("clone hstore with serialized attributes", async () => {
      await HstoreWithSerialize.createBang({ tags: new TagCollection({ one: "two" }) });
      const record = (await HstoreWithSerialize.first())!;
      const dupe = (record as any).dup();
      expect((dupe.tags as TagCollection).toHash()).toEqual({ one: "two" });
    });

    it("schema dump with shorthand", async () => {
      const output = await SchemaDumper.dumpTableSchema(connection, "hstores");
      expect(output).toMatch(/t\.hstore\("tags",\s*\{?\s*default:\s*\{\}/);
    });

    it.skip("supports to unsafe h values", () => {
      // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — protected-params
    });
  });
});
