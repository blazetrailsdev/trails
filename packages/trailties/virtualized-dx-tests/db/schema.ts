import type { DatabaseAdapter } from "@blazetrails/activerecord";

export const defineParams = { version: 2026_09_25_000001 };

export default async function defineSchema(ctx: DatabaseAdapter) {
  await ctx.createTable("authors", { force: "cascade" }, (t) => {
    t.string("name", { null: false });
  });

  await ctx.createTable("posts", { force: "cascade" }, (t) => {
    t.string("title", { null: false });
    t.integer("status", { default: 0, null: false });
    t.integer("author_id");
  });
}
