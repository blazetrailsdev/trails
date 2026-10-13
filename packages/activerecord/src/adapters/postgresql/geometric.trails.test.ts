import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";
import { Base } from "../../index.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });

  describe("PostgreSQLGeometricTypesTest", () => {
    afterEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
    });

    it("line column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_line'
      `);
      expect(rows[0].udt_name).toBe("line");
    });

    it("line default", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (
          id serial primary key,
          a_line line DEFAULT '{1,2,3}'
        )
      `);
      const rows = await adapter.execute(`
        SELECT column_default FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_line'
      `);
      expect(rows[0].column_default).toBeTruthy();
    });

    it("line type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_line) VALUES ($1)`, "SQL", [
        "{2,3,5.5}",
      ]);
      const rows = await adapter.execute(`SELECT a_line FROM test_geometric_types`);
      expect(rows[0].a_line).toMatch(/2.*3.*5\.5/);
    });

    it("line write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_line) VALUES ($1)`, "SQL", [
        "{1,2,3}",
      ]);
      const rows = await adapter.execute(`SELECT a_line FROM test_geometric_types`);
      expect(rows[0].a_line).toBeTruthy();
    });

    it("lseg column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_lseg'
      `);
      expect(rows[0].udt_name).toBe("lseg");
    });

    it("lseg type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_lseg) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_lseg FROM test_geometric_types`);
      expect(rows[0].a_lseg).toMatch(/1.*2.*3.*4/);
    });

    it("lseg write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_lseg) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_lseg FROM test_geometric_types`);
      expect(rows[0].a_lseg).toBeTruthy();
    });

    it("box column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_box'
      `);
      expect(rows[0].udt_name).toBe("box");
    });

    it("box type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_box) VALUES ($1)`, "SQL", [
        "(3,4),(1,2)",
      ]);
      const rows = await adapter.execute(`SELECT a_box FROM test_geometric_types`);
      expect(rows[0].a_box).toMatch(/3.*4.*1.*2/);
    });

    it("box write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_box) VALUES ($1)`, "SQL", [
        "(3,4),(1,2)",
      ]);
      const rows = await adapter.execute(`SELECT a_box FROM test_geometric_types`);
      expect(rows[0].a_box).toBeTruthy();
    });

    it("path column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_path'
      `);
      expect(rows[0].udt_name).toBe("path");
    });

    it("path open", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4),(5,6)]",
      ]);
      const rows = await adapter.execute(
        `SELECT isopen(a_path) AS is_open FROM test_geometric_types`,
      );
      expect(rows[0].is_open).toBe(true);
    });

    it("path closed", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, "SQL", [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(
        `SELECT isclosed(a_path) AS is_closed FROM test_geometric_types`,
      );
      expect(rows[0].is_closed).toBe(true);
    });

    it("path type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_path FROM test_geometric_types`);
      expect(rows[0].a_path).toMatch(/1.*2.*3.*4/);
    });

    it("path write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_path FROM test_geometric_types`);
      expect(rows[0].a_path).toBeTruthy();
    });

    it("polygon column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_polygon'
      `);
      expect(rows[0].udt_name).toBe("polygon");
    });

    it("polygon type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_polygon) VALUES ($1)`, "SQL", [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(`SELECT a_polygon FROM test_geometric_types`);
      expect(rows[0].a_polygon).toMatch(/1.*2.*3.*4.*5.*6/);
    });

    it("polygon write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_polygon) VALUES ($1)`, "SQL", [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(`SELECT a_polygon FROM test_geometric_types`);
      expect(rows[0].a_polygon).toBeTruthy();
    });

    it("circle column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_circle'
      `);
      expect(rows[0].udt_name).toBe("circle");
    });

    it("circle type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_circle) VALUES ($1)`, "SQL", [
        "<(1,2),3>",
      ]);
      const rows = await adapter.execute(`SELECT a_circle FROM test_geometric_types`);
      const circle = rows[0].a_circle;
      const str = typeof circle === "object" ? JSON.stringify(circle) : String(circle);
      expect(str).toMatch(/1.*2.*3/);
    });

    it("circle write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_circle) VALUES ($1)`, "SQL", [
        "<(1,2),3>",
      ]);
      const rows = await adapter.execute(`SELECT a_circle FROM test_geometric_types`);
      expect(rows[0].a_circle).toBeTruthy();
    });

    it("geometric nil", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_point point)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_point) VALUES (NULL)`);
      const rows = await adapter.execute(`SELECT a_point FROM test_geometric_types`);
      expect(rows[0].a_point).toBeNull();
    });
  });
});
