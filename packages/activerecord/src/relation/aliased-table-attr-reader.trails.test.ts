import { describe, it, expect } from "vitest";
import { Relation } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { registerModel } from "../associations.js";
import { escapeRegExp, quoteTableName } from "../support/quote-regex.js";
import { assertQueriesMatch } from "../testing/query-assertions.js";

registerModel(Post);
registerModel(Comment);

const aliasQ = quoteTableName("omg_posts");
const baseQ = quoteTableName("posts");
const idQ = quoteTableName("id");

// trails-only: guards the `Relation#table` attr_reader reads in the `relation/`
// subfiles. Rails' arel_column / order_column / reverse_sql_order / build_arel /
// find_some / construct_join_dependency all read the relation's own `table`
// (relation.rb:71), so a relation created with an aliased table
// (`Relation.create(model, table: arel_table.alias(...))`) must qualify against
// the ALIAS. Reading `model.arel_table` instead silently resolves back to the
// base table.
describe("Relation on an aliased table", () => {
  fixtures(["posts", "comments"]);

  const aliased = () => new Relation(Post, Post.arelTable.alias("omg_posts"));

  it("qualifies the star projection against the alias", () => {
    expect(aliased().toSql()).toContain(`${aliasQ}.*`);
  });

  it("qualifies select columns against the alias", () => {
    const sql = aliased().select("id").toSql();
    expect(sql).toContain(`${aliasQ}.${idQ}`);
    expect(sql).not.toMatch(new RegExp(`SELECT ${escapeRegExp(`${baseQ}.${idQ}`)}`));
  });

  it("qualifies the default reverse order against the alias", () => {
    const sql = aliased().reverseOrder().toSql();
    expect(sql).toContain(`${aliasQ}.${idQ} DESC`);
    expect(sql).not.toContain(`${baseQ}.${idQ} DESC`);
  });

  it("qualifies where columns against the alias", () => {
    expect(aliased().where({ id: 1 }).toSql()).toContain(`${aliasQ}.${idQ}`);
  });

  it("roots the join dependency on the alias", () => {
    const sql = aliased().joins("comments").toSql();
    expect(sql).toContain(`${aliasQ}.${idQ}`);
    expect(sql).not.toContain(`= ${baseQ}.${idQ}`);
  });

  it("qualifies plucked columns against the alias", async () => {
    await assertQueriesMatch(
      new RegExp(escapeRegExp(`${aliasQ}.${idQ}`)),
      undefined,
      false,
      async () => {
        await aliased().pluck("id");
      },
    );
  });

  it("roots the limited-id subquery on the alias", () => {
    const sql = aliased().eagerLoad("comments").limit(1).toSql();
    expect(sql).toContain(`${aliasQ}.${idQ}`);
    expect(sql).not.toMatch(new RegExp(`SELECT DISTINCT ${escapeRegExp(`${baseQ}.${idQ}`)}`));
  });

  it("roots the materialized limited-id query on the alias", async () => {
    await assertQueriesMatch(
      new RegExp(`SELECT DISTINCT ${escapeRegExp(`${aliasQ}.${idQ}`)}`),
      undefined,
      false,
      async () => {
        await aliased().eagerLoad("comments").limit(1);
      },
    );
  });

  it("projects the eager load's base columns off the alias", async () => {
    const posts = await aliased().eagerLoad("comments").limit(1);
    expect(posts.length).toBe(1);
    expect(posts[0].id).toBeDefined();
  });
});
