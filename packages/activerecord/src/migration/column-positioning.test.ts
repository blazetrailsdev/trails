import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

describe("Migration", () => {
  describe("ColumnPositioningTest", () => {
    let connection: AbstractAdapter;

    beforeEach(async () => {
      connection = await ambientConnection();

      await connection.createTable("testings", { id: false }, (t) => {
        t.column("first", "integer");
        t.column("second", "integer");
        t.column("third", "integer");
      });
    });

    afterEach(async () => {
      try {
        await connection.dropTable("testings");
      } catch {}
      Base.primaryKeyPrefixType = null;
    });

    it.skipIf(adapterType !== "mysql")("column positioning", async () => {
      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "first",
        "second",
        "third",
      ]);
    });

    it.skipIf(adapterType !== "mysql")("add column with positioning", async () => {
      await connection.addColumn("testings", "new_col", "integer");
      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "first",
        "second",
        "third",
        "new_col",
      ]);
    });

    it.skipIf(adapterType !== "mysql")("add column with positioning first", async () => {
      await connection.addColumn("testings", "new_col", "integer", { first: true });
      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "new_col",
        "first",
        "second",
        "third",
      ]);
    });

    it.skipIf(adapterType !== "mysql")("add column with positioning after", async () => {
      await connection.addColumn("testings", "new_col", "integer", { after: "first" });
      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "first",
        "new_col",
        "second",
        "third",
      ]);
    });

    it.skipIf(adapterType !== "mysql")("change column with positioning", async () => {
      await connection.changeColumn("testings", "second", "integer", { first: true });
      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "second",
        "first",
        "third",
      ]);

      await connection.changeColumn("testings", "second", "integer", { after: "third" });
      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "first",
        "third",
        "second",
      ]);
    });

    it.skipIf(adapterType !== "mysql")("add reference with positioning first", async () => {
      await connection.addReference("testings", "new", { polymorphic: true, first: true });
      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "new_id",
        "new_type",
        "first",
        "second",
        "third",
      ]);
    });

    it.skipIf(adapterType !== "mysql")("add reference with positioning after", async () => {
      await connection.addReference("testings", "new", { polymorphic: true, after: "first" });
      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "first",
        "new_id",
        "new_type",
        "second",
        "third",
      ]);
    });
  });
});
