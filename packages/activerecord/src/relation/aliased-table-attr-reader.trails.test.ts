import { describe, it, expect } from "vitest";
import { Relation } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { registerModel } from "../associations.js";

registerModel(Post);
registerModel(Comment);

// trails-only: guards the `Relation#table` attr_reader reads in the `relation/`
// subfiles. Rails' arel_column / order_column / reverse_sql_order / build_arel /
// find_some all read the relation's own `table` (relation.rb:71), so a relation
// created with an aliased table (`Relation.create(model, table:
// arel_table.alias(...))`) must qualify against the ALIAS. Reading
// `model.arel_table` instead silently resolves back to the base table.
describe("Relation on an aliased table", () => {
  fixtures(["posts", "comments"]);

  const aliased = () => new Relation(Post, Post.arelTable.alias("omg_posts"));

  it("qualifies the star projection against the alias", () => {
    expect(aliased().toSql()).toContain('"omg_posts".*');
  });

  it("qualifies select columns against the alias", () => {
    const sql = aliased().select("id").toSql();
    expect(sql).toContain('"omg_posts"."id"');
    expect(sql).not.toMatch(/SELECT "posts"\."id"/);
  });

  it("qualifies the default reverse order against the alias", () => {
    const sql = aliased().reverseOrder().toSql();
    expect(sql).toContain('"omg_posts"."id" DESC');
    expect(sql).not.toMatch(/"posts"\."id" DESC/);
  });

  it("qualifies where columns against the alias", () => {
    expect(aliased().where({ id: 1 }).toSql()).toContain('"omg_posts"."id"');
  });

  it("roots the join dependency on the alias", () => {
    const sql = aliased().joins("comments").toSql();
    expect(sql).toContain('"omg_posts"."id"');
    expect(sql).not.toMatch(/JOIN "comments" ON "comments"\."post_id" = "posts"\."id"/);
  });
});
