import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Preloader } from "./preloader.js";
import { ThroughAssociation } from "./preloader/through-association.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";

registerModel(Author);
registerModel(Post);
registerModel(Comment);
registerModel(Tag);
registerModel(Tagging);

(Tag as any).hasMany(
  "welcomeTaggedPosts",
  (rel: any) => rel.where("posts.title = 'Welcome to the weblog'"),
  {
    through: "taggings",
    source: "taggable",
    sourceType: "Post",
  },
);

(Author as any).hasMany("annotatedComments", (rel: any) => rel.annotate("preload-through"), {
  className: "Comment",
  through: "posts",
  source: "comments",
});

(Author as any).hasMany(
  "commentsWithSourceCondition",
  (rel: any) => rel.where("comments.body = 'first comment'"),
  {
    className: "Comment",
    through: "posts",
    source: "comments",
  },
);

(Author as any).hasMany(
  "commentsWithThroughCondition",
  (rel: any) => rel.where({ posts: { title: "Welcome to the weblog" } }),
  {
    className: "Comment",
    through: "posts",
    source: "comments",
  },
);

(Author as any).hasMany(
  "commentsWithRawThroughCondition",
  (rel: any) => rel.where("posts.title = 'Welcome to the weblog'"),
  {
    className: "Comment",
    through: "posts",
    source: "comments",
  },
);

(Author as any).hasMany(
  "commentsWithMixedCondition",
  (rel: any) => rel.where("posts.title = 'Welcome to the weblog' OR comments.body = 'x'"),
  {
    className: "Comment",
    through: "posts",
    source: "comments",
  },
);

describe("Preloader::ThroughAssociation#through_scope", () => {
  const { authors, posts, tags } = fixtures([
    "authors",
    "authorAddresses",
    "posts",
    "comments",
    "tags",
    "taggings",
  ]);

  async function throughLoader(
    owners: Author[],
    name: string,
    scope?: any,
  ): Promise<ThroughAssociation> {
    const loaders = await new Preloader({
      records: owners,
      associations: [name],
      scope,
      associateByDefault: false,
    }).loaders();
    const loader = loaders.find((l) => l instanceof ThroughAssociation);
    if (!loader) throw new Error("expected a ThroughAssociation loader");
    return loader;
  }

  it("carries annotate from the through reflection scope onto the through query", async () => {
    const david = authors("david");
    const loader = await throughLoader([david], "annotatedComments");
    const scope = (loader as any).throughScope();
    expect(scope.toSql()).toContain("preload-through");

    const [row] = await Author.where({ id: david.id }).preload(":annotatedComments");
    const comments = (row.association("annotatedComments").target ?? []) as any[];
    expect(comments.length).toBeGreaterThan(0);
  });

  it("keeps a source-table condition on a collection source at the source stage, not the through query", async () => {
    const david = authors("david");
    const loader = await throughLoader([david], "commentsWithSourceCondition");
    const scope = (loader as any).throughScope();
    const sql = scope.toSql();
    expect(sql).toContain("first comment");
    expect(sql).toMatch(/JOIN .*comments/);
  });

  it("copies a through-table condition onto the through query for a collection source", async () => {
    const david = authors("david");
    const loader = await throughLoader([david], "commentsWithThroughCondition");
    const scope = (loader as any).throughScope();
    const sql = scope.toSql();
    expect(sql).toContain("Welcome to the weblog");
  });

  it("copies a raw-SQL through-table condition onto the through query for a collection source", async () => {
    const david = authors("david");
    const loader = await throughLoader([david], "commentsWithRawThroughCondition");
    const scope = (loader as any).throughScope();
    expect(scope.toSql()).toContain("posts.title");
  });

  it("does not copy a mixed through+source predicate onto the through query", async () => {
    const david = authors("david");
    const loader = await throughLoader([david], "commentsWithMixedCondition");
    const scope = (loader as any).throughScope();
    const sql = scope.toSql();
    expect(sql).toContain("posts.title");
    expect(sql).toMatch(/JOIN .*comments/);
  });

  it("resolves a mixed through+source predicate in one query when preloading", async () => {
    const david = authors("david");
    const [row] = await Author.where({ id: david.id }).preload(":commentsWithMixedCondition");
    const bodies = ((row.association("commentsWithMixedCondition").target ?? []) as any[])
      .map((c) => c._readAttribute("body"))
      .sort();
    expect(bodies).toEqual(["Thank you again for the welcome", "Thank you for the welcome"].sort());
  });

  it("keeps a source-table condition at the source stage for a source_type through", async () => {
    const general = tags("general");
    const [row] = await Tag.where({ id: general.id }).preload(":welcomeTaggedPosts");
    const titles = ((row.association("welcomeTaggedPosts").target ?? []) as any[])
      .map((p) => p._readAttribute("title"))
      .sort();
    expect(titles).toEqual(["Welcome to the weblog"]);
  });

  it("cascades strict loading from the preload scope onto the through query", async () => {
    const david = authors("david");

    const loader = await throughLoader([david], "annotatedComments", Comment.all().strictLoading());
    const scope = (loader as any).throughScope();
    expect(scope.strictLoadingValue).toBe(true);
  });
});
