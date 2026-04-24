/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/postgresql_adapter_prevent_writes_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { ReadOnlyError } from "../../errors.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS ex`);
    await adapter.exec(`CREATE TABLE ex (id serial primary key, data character varying(255))`);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS ex`);
    await adapter.close();
  });

  // isPreventingWrites() checks pool.preventWrites before _config, and pool
  // is a public property — safer than reaching into protected _config.
  function preventWrites(a: PostgreSQLAdapter): void {
    (a as PostgreSQLAdapter & { pool: { preventWrites?: boolean } }).pool = { preventWrites: true };
  }

  function allowWrites(a: PostgreSQLAdapter): void {
    (a as PostgreSQLAdapter & { pool: { preventWrites?: boolean } }).pool = {
      preventWrites: false,
    };
  }

  describe("PostgreSQLAdapterPreventWritesTest", () => {
    it.skip("prevent writes insert", async () => {});
    it.skip("prevent writes update", async () => {});
    it.skip("prevent writes delete", async () => {});
    it.skip("prevent writes create table", async () => {});
    it.skip("prevent writes drop table", async () => {});
    it.skip("prevent writes allows select", async () => {});
    it.skip("prevent writes allows explain", async () => {});
    it.skip("prevent writes toggle", async () => {});

    it("doesnt error when a read query with cursors is called while preventing writes", async () => {
      preventWrites(adapter);
      await adapter.beginTransaction();
      try {
        await adapter.execute("DECLARE cur_ex CURSOR FOR SELECT * FROM ex");
        await adapter.execute("FETCH cur_ex");
        await adapter.execute("MOVE cur_ex");
        await adapter.execute("CLOSE cur_ex");
      } finally {
        await adapter.rollback();
      }
    });

    it("errors when an insert query is called while preventing writes", async () => {
      preventWrites(adapter);
      await expect(
        adapter.execute("INSERT INTO ex (data) VALUES ('138853948594')"),
      ).rejects.toBeInstanceOf(ReadOnlyError);
    });

    it("errors when an update query is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO ex (data) VALUES ('138853948594')");
      preventWrites(adapter);
      await expect(
        adapter.execute("UPDATE ex SET data = '9989' WHERE data = '138853948594'"),
      ).rejects.toBeInstanceOf(ReadOnlyError);
    });

    it("errors when a delete query is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO ex (data) VALUES ('138853948594')");
      preventWrites(adapter);
      await expect(
        adapter.execute("DELETE FROM ex WHERE data = '138853948594'"),
      ).rejects.toBeInstanceOf(ReadOnlyError);
    });

    it("doesnt error when a select query is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO ex (data) VALUES ('138853948594')");
      preventWrites(adapter);
      const rows = await adapter.execute("SELECT * FROM ex WHERE data = '138853948594'");
      expect(rows).toHaveLength(1);
    });

    it("doesnt error when a show query is called while preventing writes", async () => {
      preventWrites(adapter);
      const rows = await adapter.execute("SHOW TIME ZONE");
      expect(rows).toHaveLength(1);
    });

    it("doesnt error when a set query is called while preventing writes", async () => {
      preventWrites(adapter);
      await expect(adapter.execute("SET standard_conforming_strings = on")).resolves.toBeDefined();
    });

    it("doesnt error when a read query with leading chars is called while preventing writes", async () => {
      allowWrites(adapter);
      await adapter.execute("INSERT INTO ex (data) VALUES ('138853948594')");
      preventWrites(adapter);
      const rows = await adapter.execute(
        "/*action:index*/(\n( SELECT * FROM ex WHERE data = '138853948594' ) )",
      );
      expect(rows).toHaveLength(1);
    });
  });
});
