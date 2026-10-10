import { Schema } from "@blazetrails/activerecord";

await Schema.get(8).define({ version: 2026_09_26_000000 }, async (ctx) => {
  await ctx.createTable("posts", { force: "cascade" }, (t) => {
    t.string("title");
  });

  await ctx.createTable("comments", { force: "cascade" }, (t) => {
    t.integer("post_id");
    t.text("body");
  });
});
