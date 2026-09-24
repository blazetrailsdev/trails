import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import { Base } from "@blazetrails/activerecord/base";
import { register } from "@blazetrails/activerecord/connection-adapters";
import { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter";
import { sqlJsDriver } from "./sql-js-driver.js";

describe("sqlJsDriver", () => {
  it("serves Base through establishConnection over the sandbox's sql.js handle", async () => {
    register("sqljs", "SQLite3Adapter", "sqlite3-adapter", async () => SQLite3Adapter);
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE "posts" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "title" TEXT)');

    class SandboxRecord extends Base {}
    await SandboxRecord.establishConnection({
      adapter: "sqljs",
      database: ":memory:",
      driver: sqlJsDriver(db),
    });
    class Post extends SandboxRecord {
      static {
        this.tableName = "posts";
      }
    }

    const post = (await Post.create({ title: "hello" })) as Post & { title: string };
    expect(post.id).toBe(1);
    const found = (await Post.find(1)) as Post & { title: string };
    expect(found.title).toBe("hello");
    expect(db.exec("SELECT title FROM posts")[0].values).toEqual([["hello"]]);
  });
});
