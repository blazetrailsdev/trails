import { Schema } from "@blazetrails/activerecord";

await Schema.define({ version: 2023_11_23_181306 }, async (ctx) => {
  await ctx.createTable("articles", { force: "cascade" }, (t) => {
    t.text("body", { null: false });
    t.datetime("created_at", { precision: 6, null: false });
    t.datetime("updated_at", { precision: 6, null: false });
  });

  await ctx.createTable("boards", { force: "cascade" }, (t) => {
    t.string("name");
    t.datetime("created_at", { precision: 6, null: false });
    t.datetime("updated_at", { precision: 6, null: false });
  });

  await ctx.createTable("comments", { force: "cascade" }, (t) => {
    t.text("body", { null: false });
    t.integer("article_id", { null: false });
    t.datetime("created_at", { precision: 6, null: false });
    t.datetime("updated_at", { precision: 6, null: false });
    t.index(["article_id"], { name: "index_comments_on_article_id" });
  });

  await ctx.createTable("messages", { force: "cascade" }, (t) => {
    t.text("content");
    t.datetime("created_at", { precision: 6, null: false });
    t.datetime("updated_at", { precision: 6, null: false });
  });

  await ctx.addForeignKey("comments", "articles");
});
