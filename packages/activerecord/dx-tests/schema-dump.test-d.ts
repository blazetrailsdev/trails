import { describe, it } from "vitest";
import { Schema } from "@blazetrails/activerecord";
import type { PostgreSQLAdapter } from "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";
import type { AbstractMysqlAdapter } from "@blazetrails/activerecord/connection-adapters/abstract-mysql-adapter.js";
import type { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";

describe("a dumped schema typechecks against the adapter it was dumped from", () => {
  it("a PostgreSQL dump reaches the PostgreSQL column helpers", () => {
    void (async () => {
      await Schema.get(8).define<PostgreSQLAdapter>({ version: 2026_10_11_000006 }, async (ctx) => {
        await ctx.createTable("parity_days", { force: "cascade" }, (t) => {
          t.jsonb("gaps");
          t.hstore("tags");
          t.inet("address");
          t.oid("obj_id");
          t.daterange("span");
          t.uuid("token");
        });
      });
    });
  });

  it("the generic block still rejects a PostgreSQL helper", () => {
    void (async () => {
      await Schema.get(8).define(async (ctx) => {
        await ctx.createTable("parity_days", (t) => {
          // @ts-expect-error jsonb is declared on the PostgreSQL TableDefinition only
          t.jsonb("gaps");
        });
      });
    });
  });

  it("a MySQL dump reaches the MySQL column helpers", () => {
    void (async () => {
      await Schema.get(8).define<AbstractMysqlAdapter>(async (ctx) => {
        await ctx.createTable("binary_fields", { force: "cascade" }, (t) => {
          t.tinyblob("tiny_blob");
          t.mediumtext("medium_text");
        });
      });
    });
  });

  it("a SQLite dump types its block with the SQLite TableDefinition", () => {
    void (async () => {
      await Schema.get(8).define<SQLite3Adapter>(async (ctx) => {
        await ctx.createTable("posts", { force: "cascade" }, (t) => {
          t.string("title");
        });
      });
    });
  });
});
