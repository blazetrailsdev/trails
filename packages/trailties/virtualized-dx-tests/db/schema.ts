import { Schema } from "@blazetrails/activerecord";

await Schema.get(8).define({ version: 2026_09_25_000001 }, async (ctx) => {
  await ctx.createTable("authors", { force: "cascade" }, (t) => {
    t.string("name", { null: false });
  });

  await ctx.createTable("posts", { force: "cascade" }, (t) => {
    t.string("title", { null: false });
    t.integer("status", { default: 0, null: false });
    t.integer("author_id");
  });
});
