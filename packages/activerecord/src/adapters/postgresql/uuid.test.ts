import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { RecordNotFound } from "../../errors.js";
import { itIfSupports } from "../../support/supports.js";
import { fixtures } from "../../test-fixtures.js";
import { Base, registerModel } from "../../index.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import {
  assert,
  assertEmpty,
  assertNotPredicate,
  assertPredicate,
  assertRaises,
  isPresent,
} from "@blazetrails/activesupport";

class UUIDType extends Base {
  declare guid: string | null;

  static {
    this.tableName = "uuid_data_type";
  }
}

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

fixtures({}, { useTransactionalTests: false });

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeAll(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
    await adapter.enableExtension("uuid-ossp");
    supportsPgcryptoUuid = await adapter.supportsPgcryptoUuid();
    if (supportsPgcryptoUuid) await adapter.enableExtension("pgcrypto");
  });

  const dropTable = (name: string) => adapter.dropTable(name, { ifExists: true });

  let supportsPgcryptoUuid: boolean;
  const uuidFunction = () => (supportsPgcryptoUuid ? "gen_random_uuid()" : "uuid_generate_v4()");
  const uuidDefault = () => (supportsPgcryptoUuid ? {} : { default: uuidFunction() });

  describe("PostgreSQLUUIDTest", () => {
    beforeEach(async () => {
      await adapter.createTable("uuid_data_type", {}, (t) => {
        t.uuid("guid");
      });
    });

    afterEach(async () => {
      void UUIDType.resetColumnInformation();
      await dropTable("uuid_data_type");
    });

    itIfSupports("pgcrypto_uuid", "uuid column default", async () => {
      await adapter.addColumn("uuid_data_type", "thingy", "uuid", {
        null: false,
        default: "gen_random_uuid()",
      });
      void UUIDType.resetColumnInformation();
      await UUIDType.loadSchema();
      const column = UUIDType.columnsHash()["thingy"] as unknown as PgColumn;
      expect(column.defaultFunction).toBe("gen_random_uuid()");
    });

    it("change column default", async () => {
      try {
        await adapter.addColumn("uuid_data_type", "thingy", "uuid", {
          null: false,
          default: "uuid_generate_v1()",
        });
        void UUIDType.resetColumnInformation();
        await UUIDType.loadSchema();
        let column = UUIDType.columnsHash()["thingy"] as unknown as PgColumn;
        expect(column.defaultFunction).toBe("uuid_generate_v1()");

        await adapter.changeColumn("uuid_data_type", "thingy", "uuid", {
          null: false,
          default: "uuid_generate_v4()",
        });
        void UUIDType.resetColumnInformation();
        await UUIDType.loadSchema();
        column = UUIDType.columnsHash()["thingy"] as unknown as PgColumn;
        expect(column.defaultFunction).toBe("uuid_generate_v4()");
      } finally {
        void UUIDType.resetColumnInformation();
      }
    });

    it("add column with null true and default nil", async () => {
      await adapter.addColumn("uuid_data_type", "thingy", "uuid", { null: true, default: null });

      void UUIDType.resetColumnInformation();
      await UUIDType.loadSchema();
      const column = UUIDType.columnsHash()["thingy"] as unknown as PgColumn;

      assert(column.null);
      expect(column.default).toBeNull();
    });

    it("add column with default array", async () => {
      await adapter.addColumn("uuid_data_type", "thingy", "uuid", { array: true, default: [] });

      void UUIDType.resetColumnInformation();
      await UUIDType.loadSchema();
      const column = UUIDType.columnsHash()["thingy"] as unknown as PgColumn;

      assertPredicate(column, (c: PgColumn) => c.isArray());
      expect(column.default).toBe("{}");

      const schema = await dumpTableSchema(adapter, "uuid_data_type");
      expect(schema).toMatch(/t\.uuid\("thingy", \{ default: \[\], array: true \}\);?$/m);
    });

    it("data type of uuid types", async () => {
      await UUIDType.loadSchema();
      const column = UUIDType.columnsHash()["guid"] as unknown as PgColumn;
      expect(column.type).toBe("uuid");
      expect(column.sqlType).toBe("uuid");
      assertNotPredicate(column, (c: PgColumn) => c.isArray());

      const type = UUIDType.typeForAttribute("guid");
      assertNotPredicate(type!, (t) => t.isBinary());
    });

    it("treat blank uuid as nil", async () => {
      await UUIDType.createBang({ guid: "" });
      expect((await UUIDType.last())!.guid).toBeNull();
    });

    it("treat invalid uuid as nil", async () => {
      const uuid = await UUIDType.createBang({ guid: "foobar" });
      expect(uuid.guid).toBeNull();
    });

    it("invalid uuid dont modify before type cast", async () => {
      await UUIDType.loadSchema();
      const uuid = new UUIDType({ guid: "foobar" });
      expect(uuid.readAttributeBeforeTypeCast("guid")).toBe("foobar");
    });

    it("invalid uuid dont match to nil", async () => {
      await UUIDType.createBang();
      assertEmpty(await UUIDType.where({ guid: "" }));
      assertEmpty(await UUIDType.where({ guid: "foobar" }));
    });

    it("uuid change format does not mark dirty", async () => {
      await UUIDType.loadSchema();
      const model = await UUIDType.createBang({ guid: "abcd-0123-4567-89ef-dead-beef-0101-1010" });
      model.guid = (model.guid as string).replace(/[a-z]/gi, (c) =>
        c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(),
      );
      assertNotPredicate(model, (m: UUIDType) => m.isChanged);

      model.guid = `{${model.guid}}`;
      assertNotPredicate(model, (m: UUIDType) => m.isChanged);
    });

    class DuckUUID {
      constructor(private uuid: string) {}

      toString(): string {
        return this.uuid;
      }
    }

    it("acceptable uuid regex", async () => {
      await UUIDType.loadSchema();
      [
        "A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11",
        "{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}",
        "a0eebc999c0b4ef8bb6d6bb9bd380a11",
        "a0ee-bc99-9c0b-4ef8-bb6d-6bb9-bd38-0a11",
        "{a0eebc99-9c0b4ef8-bb6d6bb9-bd380a11}",
        "{a0eebc99-9c0b-4ef8-fb6d-6bb9bd380a11}",
        new DuckUUID("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11"),
      ].forEach((validUuid) => {
        const uuid = new UUIDType({ guid: validUuid });
        expect(Object(uuid.guid)).toBeInstanceOf(String);
      });

      [
        ["A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11"],
        {},
        0,
        0.0,
        true,
        "Z0000C99-9C0B-4EF8-BB6D-6BB9BD380A11",
        "a0eebc999r0b4ef8ab6d6bb9bd380a11",
        "a0ee-bc99------4ef8-bb6d-6bb9-bd38-0a11",
        "{a0eebc99-bb6d6bb9-bd380a11}",
        "{a0eebc99-9c0b4ef8-bb6d6bb9-bd380a11",
        "a0eebc99-9c0b4ef8-bb6d6bb9-bd380a11}",
      ].forEach((invalidUuid) => {
        const uuid = new UUIDType({ guid: invalidUuid });
        expect(uuid.guid).toBeNull();
      });
    });

    it("uuid formats", async () => {
      for (const validUuid of [
        "A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11",
        "{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}",
        "a0eebc999c0b4ef8bb6d6bb9bd380a11",
        "a0ee-bc99-9c0b-4ef8-bb6d-6bb9-bd38-0a11",
        "{a0eebc99-9c0b4ef8-bb6d6bb9-bd380a11}",
      ]) {
        await UUIDType.create({ guid: validUuid });
        const uuid = (await UUIDType.last())!;
        expect(uuid.guid).toEqual("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
      }
    });

    it("schema dump with shorthand", async () => {
      const output = await dumpTableSchema(adapter, "uuid_data_type");
      expect(output).toMatch(/t\.uuid\("guid"/);
    });

    it("uniqueness validation ignores uuid", async () => {
      class klass extends Base {
        declare guid: string | null;

        static {
          this.tableName = "uuid_data_type";
          this.validates("guid", { uniqueness: { caseSensitive: false } });
        }

        static override get name() {
          return "UUIDType";
        }
      }
      await klass.loadSchema();

      const record = await klass.createBang({ guid: "a0ee-bc99-9c0b-4ef8-bb6d-6bb9-bd38-0a11" });
      const duplicate = new klass({ guid: record.guid });

      assertPredicate(record.guid, isPresent);
      assertNotPredicate(await duplicate.isValid(), (v: boolean) => v);
    });
  });

  describe("PostgreSQLUUIDGenerationTest", () => {
    class UUID extends Base {
      static {
        this.tableName = "pg_uuids";
      }
    }

    beforeEach(async () => {
      await adapter.createTable("pg_uuids", { id: "uuid", default: "uuid_generate_v1()" }, (t) => {
        t.string("name");
        t.uuid("other_uuid", { default: "uuid_generate_v4()" });
      });

      await adapter.execute(`
        CREATE OR REPLACE FUNCTION my_uuid_generator() RETURNS uuid
        AS $$ SELECT * FROM ${uuidFunction()} $$
        LANGUAGE SQL VOLATILE;
      `);

      await adapter.createTable(
        "pg_uuids_2",
        { id: "uuid", default: "my_uuid_generator()" },
        (t) => {
          t.string("name");
          t.uuid("other_uuid_2", { default: "my_uuid_generator()" });
        },
      );

      await adapter.createTable("pg_uuids_3", { id: "uuid", ...uuidDefault() }, (t) => {
        t.string("name");
      });
      void UUID.resetColumnInformation();
      await UUID.loadSchema();
    });

    afterEach(async () => {
      await dropTable("pg_uuids");
      await dropTable("pg_uuids_2");
      await dropTable("pg_uuids_3");
      await adapter.execute("DROP FUNCTION IF EXISTS my_uuid_generator();");
      void UUID.resetColumnInformation();
    });

    it("id is uuid", () => {
      expect(UUID.columnsHash()["id"].type).toBe("uuid");
      assert(UUID.primaryKey);
    });

    it("id has a default", async () => {
      const u = await UUID.create();
      expect(u.id).not.toBeNull();
    });

    it("auto create uuid", async () => {
      const u = await UUID.create();
      await u.reload();
      expect(u.readAttribute("other_uuid")).not.toBeNull();
    });

    it("pk and sequence for uuid primary key", async () => {
      const [pk, seq] = (await adapter.pkAndSequenceFor("pg_uuids"))!;
      expect(pk).toBe("id");
      expect(seq).toBeNull();
    });

    it("schema dumper for uuid primary key", async () => {
      const schema = await dumpTableSchema(adapter, "pg_uuids");
      expect(schema).toMatch(
        /\bcreateTable\("pg_uuids", \{ id: "uuid", default: \(\) => "uuid_generate_v1\(\)"/,
      );
      expect(schema).toMatch(/t\.uuid\("other_uuid", \{ default: \(\) => "uuid_generate_v4\(\)"/);
    });

    it("schema dumper for uuid primary key with custom default", async () => {
      const schema = await dumpTableSchema(adapter, "pg_uuids_2");
      expect(schema).toMatch(
        /\bcreateTable\("pg_uuids_2", \{ id: "uuid", default: \(\) => "my_uuid_generator\(\)"/,
      );
      expect(schema).toMatch(
        /t\.uuid\("other_uuid_2", \{ default: \(\) => "my_uuid_generator\(\)"/,
      );
    });

    it("schema dumper for uuid primary key default", async () => {
      const schema = await dumpTableSchema(adapter, "pg_uuids_3");
      // eslint-disable-next-line blazetrails/no-conditional-in-test -- uuid_test.rb:289 branches on supports_pgcrypto_uuid? and parity:test counts both arms
      if (supportsPgcryptoUuid) {
        expect(schema).toMatch(
          /\bcreateTable\("pg_uuids_3", \{ id: "uuid", default: \(\) => "gen_random_uuid\(\)"/,
        );
      } else {
        expect(schema).toMatch(
          /\bcreateTable\("pg_uuids_3", \{ id: "uuid", default: \(\) => "uuid_generate_v4\(\)"/,
        );
      }
    });

    it.skip("schema dumper for uuid primary key default in legacy migration", () => {});
  });

  describe("PostgreSQLUUIDTestNilDefault", () => {
    beforeEach(async () => {
      await adapter.createTable("pg_uuids", { id: false }, (t) => {
        t.primaryKey("id", "uuid", { default: null });
        t.string("name");
      });
    });

    afterEach(async () => {
      await dropTable("pg_uuids");
    });

    it("id allows default override via nil", async () => {
      const colDesc = (
        await adapter.execute(`SELECT pg_get_expr(d.adbin, d.adrelid) as default
                                  FROM pg_attribute a
                                  LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                                  WHERE a.attname='id' AND a.attrelid = 'pg_uuids'::regclass`)
      )[0];
      expect(colDesc["default"]).toBeNull();
    });

    it("schema dumper for uuid primary key with default override via nil", async () => {
      const schema = await dumpTableSchema(adapter, "pg_uuids");
      expect(schema).toMatch(/\bcreateTable\("pg_uuids", \{ id: "uuid", default: null/);
    });

    it.skip("schema dumper for uuid primary key with default nil in legacy migration", () => {});
  });

  describe("PostgreSQLUUIDTestInverseOf", () => {
    class UuidPost extends Base {
      static {
        this.tableName = "pg_uuid_posts";
        this.hasMany("uuidComments", { className: "UuidCommentInverse", inverseOf: "uuidPost" });
      }
    }
    class UuidComment extends Base {
      static {
        this.tableName = "pg_uuid_comments";
        this.belongsTo("uuidPost", { className: "UuidPostInverse" });
      }
    }
    registerModel("UuidPostInverse", UuidPost);
    registerModel("UuidCommentInverse", UuidComment);

    beforeEach(async () => {
      await adapter.transaction(async () => {
        await adapter.createTable("pg_uuid_posts", { id: "uuid", ...uuidDefault() }, (t) => {
          t.string("title");
        });
        await adapter.createTable("pg_uuid_comments", { id: "uuid", ...uuidDefault() }, (t) => {
          t.references("uuid_post", { type: "uuid" });
          t.string("content");
        });
      });
      void UuidPost.resetColumnInformation();
      void UuidComment.resetColumnInformation();
      await UuidPost.loadSchema();
      await UuidComment.loadSchema();
    });

    afterEach(async () => {
      await dropTable("pg_uuid_comments");
      await dropTable("pg_uuid_posts");
    });

    it("collection association with uuid", async () => {
      const post = (await UuidPost.createBang()) as any;
      const comment = await post.uuidComments.createBang();
      assert(await post.uuidComments.find(comment.id));
    });

    it("find with uuid", async () => {
      await UuidPost.createBang();
      await assertRaises([RecordNotFound], {}, async () => {
        await UuidPost.find(123456);
      });
    });

    it("find by with uuid", async () => {
      await UuidPost.createBang();
      expect(await UuidPost.findBy({ id: 789 })).toBeNull();
    });
  });

  describe("PostgreSQLUUIDHasManyThroughDisableJoinsTest", () => {
    class UuidForum extends Base {
      static {
        this.tableName = "pg_uuid_forums";
        this.hasMany(
          "uuidPosts",
          function (this: any) {
            return this.order("title DESC");
          },
          {
            className: "UuidPostDj",
          },
        );
        this.hasMany("uuidComments", { className: "UuidCommentDj", through: "uuidPosts" });
        this.hasMany("uuidCommentsWithoutJoins", {
          className: "UuidCommentDj",
          through: "uuidPosts",
          source: "uuidComments",
          disableJoins: true,
        });
      }
    }
    class UuidPost extends Base {
      static {
        this.tableName = "pg_uuid_posts";
        this.belongsTo("uuidForum", { className: "UuidForumDj" });
        this.hasMany("uuidComments", { className: "UuidCommentDj" });
      }
    }
    class UuidComment extends Base {
      static {
        this.tableName = "pg_uuid_comments";
        this.belongsTo("uuidPost", { className: "UuidPostDj" });
        this.hasOne("uuidForum", { className: "UuidForumDj", through: "uuidPost" });
        this.hasOne("uuidForumWithoutJoins", {
          className: "UuidForumDj",
          through: "uuidPost",
          source: "uuidForum",
          disableJoins: true,
        });
      }
    }
    registerModel("UuidForumDj", UuidForum);
    registerModel("UuidPostDj", UuidPost);
    registerModel("UuidCommentDj", UuidComment);

    beforeEach(async () => {
      await adapter.transaction(async () => {
        await adapter.createTable("pg_uuid_forums", { id: "uuid", ...uuidDefault() }, (t) => {
          t.string("name");
        });
        await adapter.createTable("pg_uuid_posts", { id: "uuid", ...uuidDefault() }, (t) => {
          t.references("uuid_forum", { type: "uuid" });
          t.string("title");
        });
        await adapter.createTable("pg_uuid_comments", { id: "uuid", ...uuidDefault() }, (t) => {
          t.references("uuid_post", { type: "uuid" });
          t.string("content");
        });
      });
      for (const klass of [UuidForum, UuidPost, UuidComment]) {
        void klass.resetColumnInformation();
        await klass.loadSchema();
      }
    });

    afterEach(async () => {
      await dropTable("pg_uuid_comments");
      await dropTable("pg_uuid_posts");
      await dropTable("pg_uuid_forums");
    });

    it("uuid primary key and disable joins with delegate cache", async () => {
      const uuidForum = (await UuidForum.createBang()) as any;
      const uuidPost1 = await uuidForum.uuidPosts.createBang();
      const uuidComment11 = await uuidPost1.uuidComments.createBang();
      const uuidComment12 = await uuidPost1.uuidComments.createBang();
      const uuidPost2 = await uuidForum.uuidPosts.createBang();
      const uuidComment21 = await uuidPost2.uuidComments.createBang();
      const uuidComment22 = await uuidPost2.uuidComments.createBang();
      const uuidComment23 = await uuidPost2.uuidComments.createBang();

      expect(
        (await uuidForum.uuidCommentsWithoutJoins.order("id").toArray())
          .map((c: any) => c.id)
          .sort(),
      ).toEqual(
        [
          uuidComment11.id,
          uuidComment12.id,
          uuidComment21.id,
          uuidComment22.id,
          uuidComment23.id,
        ].sort(),
      );
    });
  });
});
