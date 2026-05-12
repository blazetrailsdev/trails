// Demo: blog models on AR using the new Node 22 `node:sqlite` driver.
// Run from repo root:
//   ASDF_NODEJS_VERSION=24.1.0 node scripts/demo-blog.mjs

import { Base, MigrationContext, registerModel } from "@blazetrails/activerecord";
// Side-effect import: registers the node:sqlite driver with the AR registry.
import "@blazetrails/activesupport/sqlite/node-sqlite";

class Author extends Base {
  static {
    this._recordTimestamps = false;
    this.tableName = "authors";
    this.attribute("name", "string");
    this.attribute("email", "string");
    this.hasMany("posts", { dependent: "destroy" });
  }
}

class Post extends Base {
  static {
    this._recordTimestamps = false;
    this.tableName = "posts";
    this.attribute("title", "string");
    this.attribute("body", "string");
    this.attribute("published", "boolean", { default: false });
    this.attribute("author_id", "integer");
    this.belongsTo("author");
    this.hasMany("comments", { dependent: "destroy" });
    this.scope("published", (q) => q.where({ published: true }));
  }
}

class Comment extends Base {
  static {
    this._recordTimestamps = false;
    this.tableName = "comments";
    this.attribute("body", "string");
    this.attribute("post_id", "integer");
    this.belongsTo("post");
  }
}

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dbPath = join(mkdtempSync(join(tmpdir(), "trails-demo-")), "blog.sqlite3");
console.log("db:            ", dbPath);

registerModel(Author);
registerModel(Post);
registerModel(Comment);

await Base.establishConnection({
  adapter: "sqlite3",
  database: dbPath,
  driver: "node-sqlite",
});

const conn = await Base.connection();
const m = new MigrationContext(conn);

await m.createTable("authors", {}, (t) => {
  t.string("name", { null: false });
  t.string("email", { null: false });
});
await m.createTable("posts", {}, (t) => {
  t.string("title", { null: false });
  t.text("body");
  t.boolean("published", { default: false });
  t.references("author");
});
await m.createTable("comments", {}, (t) => {
  t.text("body");
  t.references("post");
});

const dean = await Author.create({ name: "Dean", email: "d@example.com" });

const hello = await Post.create({
  title: "Hello, node:sqlite",
  body: "First post off the built-in driver.",
  published: true,
  author_id: dean.id,
});

await Post.create({
  title: "Draft",
  body: "Not yet ready.",
  author_id: dean.id,
});

await Comment.create({ body: "Nice!", post_id: hello.id });
await Comment.create({ body: "Welcome aboard.", post_id: hello.id });

console.log("driver:        ", Base.connectionPool().adapter?.constructor.name);
console.log("authors count: ", await Author.count());
console.log("posts count:   ", await Post.count());
console.log(
  "published:     ",
  (await Post.published().toArray()).map((p) => p.title),
);

const loaded = await Post.find(hello.id);
const author = await loaded.loadBelongsTo("author");
const commentRows = await loaded.comments.toArray();
console.log(`post:           "${loaded.title}" by ${author?.name}`);
console.log("comments:      ", commentRows.map((c) => c.body));

await Base.connectionPool().disconnect();
