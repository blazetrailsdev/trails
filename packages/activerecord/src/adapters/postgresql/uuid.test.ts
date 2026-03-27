/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/uuid_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { isValidUuid, normalizeUuid } from "../../connection-adapters/postgresql/oid/uuid.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeAll(async () => {
    const setup = new PostgreSQLAdapter(PG_TEST_URL);
    await setup.exec(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await setup.close();
  });

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS uuid_data_type`);
    await adapter.exec(`
      CREATE TABLE uuid_data_type (
        id serial primary key,
        guid uuid DEFAULT gen_random_uuid(),
        other_guid uuid
      )
    `);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS uuid_data_type`);
    await adapter.close();
  });

  describe("PostgreSQLUUIDTest", () => {
    it("uuid column", async () => {
      const rows = await adapter.execute(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'uuid_data_type' AND column_name = 'guid'
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0].data_type).toBe("uuid");
    });

    it("uuid default", async () => {
      const rows = await adapter.execute(`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'uuid_data_type' AND column_name = 'guid'
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0].column_default).toMatch(/gen_random_uuid/);
    });

    it("uuid type cast", async () => {
      expect(normalizeUuid("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(
        "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      );
      expect(normalizeUuid("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11")).toBe(
        "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      );
    });

    it("uuid write", async () => {
      const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES ($1)`, [uuid]);
      const rows = await adapter.execute(`SELECT guid FROM uuid_data_type`);
      expect(rows[0].guid).toBe(uuid);
    });

    it("uuid select", async () => {
      const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES ($1)`, [uuid]);
      const rows = await adapter.execute(`SELECT guid FROM uuid_data_type WHERE guid = $1`, [uuid]);
      expect(rows).toHaveLength(1);
      expect(rows[0].guid).toBe(uuid);
    });

    it("uuid where", async () => {
      const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES ($1)`, [uuid]);
      const rows = await adapter.execute(`SELECT * FROM uuid_data_type WHERE guid = $1`, [uuid]);
      expect(rows).toHaveLength(1);
    });

    it("uuid order", async () => {
      const uuid1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const uuid2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES ($1)`, [uuid2]);
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES ($1)`, [uuid1]);
      const rows = await adapter.execute(`SELECT guid FROM uuid_data_type ORDER BY guid ASC`);
      expect(rows[0].guid).toBe(uuid1);
      expect(rows[1].guid).toBe(uuid2);
    });

    it("uuid pluck", async () => {
      const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES ($1)`, [uuid]);
      const rows = await adapter.execute(`SELECT guid FROM uuid_data_type`);
      expect(rows.map((r) => r.guid)).toEqual([uuid]);
    });

    it("uuid primary key", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      await adapter.exec(`
        CREATE TABLE uuid_pk_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      try {
        const rows = await adapter.execute(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = 'uuid_pk_test' AND column_name = 'id'
        `);
        expect(rows[0].data_type).toBe("uuid");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      }
    });

    it("uuid primary key default", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      await adapter.exec(`
        CREATE TABLE uuid_pk_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      try {
        await adapter.execute(`INSERT INTO uuid_pk_test (name) VALUES ($1)`, ["test"]);
        const rows = await adapter.execute(`SELECT id FROM uuid_pk_test`);
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBeTruthy();
        expect(isValidUuid(rows[0].id as string)).toBe(true);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      }
    });

    it("uuid primary key insert", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      await adapter.exec(`
        CREATE TABLE uuid_pk_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      try {
        const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
        await adapter.execute(`INSERT INTO uuid_pk_test (id, name) VALUES ($1, $2)`, [
          uuid,
          "test",
        ]);
        const rows = await adapter.execute(`SELECT id FROM uuid_pk_test`);
        expect(rows[0].id).toBe(uuid);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      }
    });

    it("uuid pk with auto populate", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      await adapter.exec(`
        CREATE TABLE uuid_pk_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      try {
        await adapter.execute(`INSERT INTO uuid_pk_test (name) VALUES ($1)`, ["auto"]);
        const rows = await adapter.execute(`SELECT id, name FROM uuid_pk_test`);
        expect(rows[0].name).toBe("auto");
        expect(isValidUuid(rows[0].id as string)).toBe(true);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      }
    });

    it("uuid pk create", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      await adapter.exec(`
        CREATE TABLE uuid_pk_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      try {
        await adapter.execute(`INSERT INTO uuid_pk_test (name) VALUES ($1)`, ["created"]);
        const rows = await adapter.execute(`SELECT * FROM uuid_pk_test`);
        expect(rows).toHaveLength(1);
        expect(isValidUuid(rows[0].id as string)).toBe(true);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      }
    });

    it("uuid pk find", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      await adapter.exec(`
        CREATE TABLE uuid_pk_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      try {
        await adapter.execute(`INSERT INTO uuid_pk_test (name) VALUES ($1)`, ["findme"]);
        const inserted = await adapter.execute(`SELECT id FROM uuid_pk_test`);
        const id = inserted[0].id;
        const rows = await adapter.execute(`SELECT * FROM uuid_pk_test WHERE id = $1`, [id]);
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("findme");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_pk_test`);
      }
    });

    it.skip("uuid schema dump", async () => {});
    it.skip("uuid migration", async () => {});

    it("uuid gen random uuid", async () => {
      const rows = await adapter.execute(`SELECT gen_random_uuid() AS uuid`);
      expect(isValidUuid(rows[0].uuid as string)).toBe(true);
    });

    it("uuid gen random uuid default", async () => {
      await adapter.execute(`INSERT INTO uuid_data_type (other_guid) VALUES ($1)`, [
        "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      ]);
      const rows = await adapter.execute(`SELECT guid FROM uuid_data_type`);
      expect(isValidUuid(rows[0].guid as string)).toBe(true);
    });

    it("uuid invalid", async () => {
      expect(isValidUuid("not-a-uuid")).toBe(false);
      expect(normalizeUuid("not-a-uuid")).toBeNull();
    });

    it("uuid nil", async () => {
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES (NULL)`);
      const rows = await adapter.execute(`SELECT guid FROM uuid_data_type`);
      expect(rows[0].guid).toBeNull();
    });

    it("uuid blank", async () => {
      expect(normalizeUuid("")).toBeNull();
      expect(normalizeUuid("   ")).toBeNull();
    });

    it("uuid uniqueness", async () => {
      const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      await adapter.exec(`DROP TABLE IF EXISTS uuid_unique_test`);
      await adapter.exec(`
        CREATE TABLE uuid_unique_test (
          id serial primary key,
          guid uuid UNIQUE
        )
      `);
      try {
        await adapter.execute(`INSERT INTO uuid_unique_test (guid) VALUES ($1)`, [uuid]);
        await expect(
          adapter.execute(`INSERT INTO uuid_unique_test (guid) VALUES ($1)`, [uuid]),
        ).rejects.toThrow();
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_unique_test`);
      }
    });

    it("uuid array", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_array_test`);
      await adapter.exec(`
        CREATE TABLE uuid_array_test (
          id serial primary key,
          guids uuid[]
        )
      `);
      try {
        const uuid1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
        const uuid2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
        await adapter.execute(`INSERT INTO uuid_array_test (guids) VALUES ($1)`, [
          `{${uuid1},${uuid2}}`,
        ]);
        const rows = await adapter.execute(`SELECT guids FROM uuid_array_test`);
        const guids = rows[0].guids as string[];
        expect(guids).toHaveLength(2);
        expect(guids).toContain(uuid1);
        expect(guids).toContain(uuid2);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_array_test`);
      }
    });

    it("uuid in relation", async () => {
      const uuid1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const uuid2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES ($1)`, [uuid1]);
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES ($1)`, [uuid2]);
      const rows = await adapter.execute(
        `SELECT guid FROM uuid_data_type WHERE guid IN ($1, $2) ORDER BY guid`,
        [uuid1, uuid2],
      );
      expect(rows).toHaveLength(2);
    });

    it.skip("uuid association", async () => {});

    it("uuid foreign key", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_fk_child`);
      await adapter.exec(`DROP TABLE IF EXISTS uuid_fk_parent`);
      await adapter.exec(`
        CREATE TABLE uuid_fk_parent (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      await adapter.exec(`
        CREATE TABLE uuid_fk_child (
          id serial primary key,
          parent_id uuid REFERENCES uuid_fk_parent(id)
        )
      `);
      try {
        await adapter.execute(`INSERT INTO uuid_fk_parent (name) VALUES ($1)`, ["parent"]);
        const parents = await adapter.execute(`SELECT id FROM uuid_fk_parent`);
        const parentId = parents[0].id;
        await adapter.execute(`INSERT INTO uuid_fk_child (parent_id) VALUES ($1)`, [parentId]);
        const children = await adapter.execute(`SELECT * FROM uuid_fk_child WHERE parent_id = $1`, [
          parentId,
        ]);
        expect(children).toHaveLength(1);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_fk_child`);
        await adapter.exec(`DROP TABLE IF EXISTS uuid_fk_parent`);
      }
    });

    it("uuid index", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_index_test`);
      await adapter.exec(`
        CREATE TABLE uuid_index_test (
          id serial primary key,
          guid uuid
        )
      `);
      await adapter.exec(`CREATE INDEX idx_uuid_test ON uuid_index_test (guid)`);
      try {
        const rows = await adapter.execute(`
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'uuid_index_test' AND indexname = 'idx_uuid_test'
        `);
        expect(rows).toHaveLength(1);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_index_test`);
      }
    });

    it("uuid change column", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_change_test`);
      await adapter.exec(`
        CREATE TABLE uuid_change_test (
          id serial primary key,
          guid text
        )
      `);
      try {
        await adapter.exec(
          `ALTER TABLE uuid_change_test ALTER COLUMN guid TYPE uuid USING guid::uuid`,
        );
        const rows = await adapter.execute(`
          SELECT data_type FROM information_schema.columns
          WHERE table_name = 'uuid_change_test' AND column_name = 'guid'
        `);
        expect(rows[0].data_type).toBe("uuid");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_change_test`);
      }
    });

    it("uuid remove column", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_remove_test`);
      await adapter.exec(`
        CREATE TABLE uuid_remove_test (
          id serial primary key,
          guid uuid,
          name text
        )
      `);
      try {
        await adapter.exec(`ALTER TABLE uuid_remove_test DROP COLUMN guid`);
        const rows = await adapter.execute(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'uuid_remove_test'
        `);
        const columns = rows.map((r) => r.column_name);
        expect(columns).not.toContain("guid");
        expect(columns).toContain("name");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_remove_test`);
      }
    });

    it("uuid column default", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_column_default_test`);
      await adapter.exec(`
        CREATE TABLE uuid_column_default_test (
          id serial primary key,
          guid uuid DEFAULT gen_random_uuid()
        )
      `);
      try {
        const rows = await adapter.execute(`
          INSERT INTO uuid_column_default_test DEFAULT VALUES
          RETURNING guid
        `);
        expect(isValidUuid(rows[0].guid as string)).toBe(true);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_column_default_test`);
      }
    });

    it("change column default", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_default_test`);
      await adapter.exec(`
        CREATE TABLE uuid_default_test (
          id serial primary key,
          guid uuid DEFAULT gen_random_uuid()
        )
      `);
      try {
        let rows = await adapter.execute(`
          SELECT column_default FROM information_schema.columns
          WHERE table_name = 'uuid_default_test' AND column_name = 'guid'
        `);
        expect(rows[0].column_default).toMatch(/gen_random_uuid/);

        await adapter.exec(
          `ALTER TABLE uuid_default_test ALTER COLUMN guid SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid`,
        );
        rows = await adapter.execute(`
          SELECT column_default FROM information_schema.columns
          WHERE table_name = 'uuid_default_test' AND column_name = 'guid'
        `);
        expect(rows[0].column_default).toMatch(/00000000/);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_default_test`);
      }
    });

    it("add column with null true and default nil", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_null_test`);
      await adapter.exec(`
        CREATE TABLE uuid_null_test (id serial primary key)
      `);
      try {
        await adapter.exec(`ALTER TABLE uuid_null_test ADD COLUMN guid uuid DEFAULT NULL`);
        const rows = await adapter.execute(`
          SELECT column_default, is_nullable FROM information_schema.columns
          WHERE table_name = 'uuid_null_test' AND column_name = 'guid'
        `);
        expect(rows[0].is_nullable).toBe("YES");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_null_test`);
      }
    });

    it("add column with default array", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_arr_default_test`);
      await adapter.exec(`
        CREATE TABLE uuid_arr_default_test (id serial primary key)
      `);
      try {
        await adapter.exec(
          `ALTER TABLE uuid_arr_default_test ADD COLUMN guids uuid[] DEFAULT '{}'`,
        );
        const rows = await adapter.execute(`
          SELECT column_default FROM information_schema.columns
          WHERE table_name = 'uuid_arr_default_test' AND column_name = 'guids'
        `);
        expect(rows[0].column_default).toMatch(/\{\}/);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_arr_default_test`);
      }
    });

    it("data type of uuid types", async () => {
      const rows = await adapter.execute(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'uuid_data_type' AND column_name = 'guid'
      `);
      expect(rows[0].data_type).toBe("uuid");
    });

    it("treat blank uuid as nil", () => {
      expect(normalizeUuid("")).toBeNull();
    });

    it("treat invalid uuid as nil", () => {
      expect(normalizeUuid("foobar")).toBeNull();
    });

    it("invalid uuid dont modify before type cast", () => {
      const raw = "foobar";
      expect(normalizeUuid(raw)).toBeNull();
      expect(raw).toBe("foobar");
    });

    it("invalid uuid dont match to nil", async () => {
      await adapter.execute(`INSERT INTO uuid_data_type (guid) VALUES (NULL)`);
      await expect(
        adapter.execute(`SELECT * FROM uuid_data_type WHERE guid = $1`, ["foobar"]),
      ).rejects.toThrow();
    });

    it("uuid change format does not mark dirty", () => {
      const a = normalizeUuid("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11");
      const b = normalizeUuid("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
      const c = normalizeUuid("{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}");
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it("acceptable uuid regex", () => {
      expect(isValidUuid("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(true);
      expect(isValidUuid("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11")).toBe(true);
      expect(isValidUuid("{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}")).toBe(true);
      expect(isValidUuid("a0eebc999c0b4ef8bb6d6bb9bd380a11")).toBe(true);
      expect(isValidUuid("A0EEBC999C0B4EF8BB6D6BB9BD380A11")).toBe(true);

      expect(isValidUuid("")).toBe(false);
      expect(isValidUuid("hello")).toBe(false);
      expect(isValidUuid("zz0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1")).toBe(false);
      expect(isValidUuid("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1")).toBe(false);
    });

    it("uuid formats", () => {
      const expected = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      expect(normalizeUuid("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11")).toBe(expected);
      expect(normalizeUuid("{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}")).toBe(expected);
      expect(normalizeUuid("a0eebc999c0b4ef8bb6d6bb9bd380a11")).toBe(expected);
      expect(normalizeUuid("A0EEBC999C0B4EF8BB6D6BB9BD380A11")).toBe(expected);
    });

    it.skip("uniqueness validation ignores uuid", () => {});
  });

  describe("PostgreSQLUUIDGenerationTest", () => {
    it("id is uuid", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_gen_test`);
      await adapter.exec(`
        CREATE TABLE uuid_gen_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      try {
        const rows = await adapter.execute(`
          SELECT data_type FROM information_schema.columns
          WHERE table_name = 'uuid_gen_test' AND column_name = 'id'
        `);
        expect(rows[0].data_type).toBe("uuid");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_gen_test`);
      }
    });

    it("id has a default", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_gen_test`);
      await adapter.exec(`
        CREATE TABLE uuid_gen_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text
        )
      `);
      try {
        await adapter.execute(`INSERT INTO uuid_gen_test (name) VALUES ($1)`, ["test"]);
        const rows = await adapter.execute(`SELECT id FROM uuid_gen_test`);
        expect(rows[0].id).toBeTruthy();
        expect(isValidUuid(rows[0].id as string)).toBe(true);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_gen_test`);
      }
    });

    it("auto create uuid", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_gen_test`);
      await adapter.exec(`
        CREATE TABLE uuid_gen_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          other uuid DEFAULT gen_random_uuid(),
          name text
        )
      `);
      try {
        await adapter.execute(`INSERT INTO uuid_gen_test (name) VALUES ($1)`, ["test"]);
        const rows = await adapter.execute(`SELECT id, other FROM uuid_gen_test`);
        expect(isValidUuid(rows[0].id as string)).toBe(true);
        expect(isValidUuid(rows[0].other as string)).toBe(true);
        expect(rows[0].id).not.toBe(rows[0].other);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_gen_test`);
      }
    });

    it("pk and sequence for uuid primary key", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_gen_test`);
      await adapter.exec(`
        CREATE TABLE uuid_gen_test (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY
        )
      `);
      try {
        const rows = await adapter.execute(`
          SELECT pg_get_serial_sequence('uuid_gen_test', 'id') AS seq
        `);
        expect(rows[0].seq).toBeNull();
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_gen_test`);
      }
    });

    it.skip("schema dumper for uuid primary key", () => {});
    it.skip("schema dumper for uuid primary key with custom default", () => {});
    it.skip("schema dumper for uuid primary key default", () => {});
    it.skip("schema dumper for uuid primary key default in legacy migration", () => {});
  });

  describe("PostgreSQLUUIDTestNilDefault", () => {
    it("id allows default override via nil", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS uuid_nil_default_test`);
      await adapter.exec(`
        CREATE TABLE uuid_nil_default_test (
          id uuid PRIMARY KEY,
          name text
        )
      `);
      try {
        const rows = await adapter.execute(`
          SELECT column_default FROM information_schema.columns
          WHERE table_name = 'uuid_nil_default_test' AND column_name = 'id'
        `);
        expect(rows[0].column_default).toBeNull();
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS uuid_nil_default_test`);
      }
    });

    it.skip("schema dumper for uuid primary key with default override via nil", () => {});
    it.skip("schema dumper for uuid primary key with default nil in legacy migration", () => {});
  });

  describe("PostgreSQLUUIDTestInverseOf", () => {
    it.skip("collection association with uuid", () => {});
    it.skip("find with uuid", () => {});
    it.skip("find by with uuid", () => {});
  });

  describe("PostgreSQLUUIDHasManyThroughDisableJoinsTest", () => {
    it.skip("uuid primary key and disable joins with delegate cache", () => {});
  });
});
