import type { DatabaseAdapter } from "@blazetrails/activerecord";

export const defineParams = { version: 2026_09_26_000000 };

export default async function defineSchema(ctx: DatabaseAdapter) {
  await ctx.createTable("posts", { force: "cascade" }, (t) => {
    t.string("title");
  });

  await ctx.createTable("comments", { force: "cascade" }, (t) => {
    t.integer("post_id");
    t.text("body");
  });
}
