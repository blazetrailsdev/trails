import { describe, it, expect, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base } from "../../../lib/index.js";
import { DisableJoinsAssociationScope } from "../../../lib/associations/disable-joins-association-scope.js";
import { DisableJoinsAssociationRelation } from "../../../lib/disable-joins-association-relation.js";
import { fixtures } from "../../support/use-fixtures.js";
import { Author } from "../../models/author.js";
import { Post } from "../../models/post.js";
import { Comment } from "../../models/comment.js";
import { Member } from "../../models/member.js";

describe("DisableJoinsAssociationScope", () => {
  fixtures(["posts", "authors", "comments", "members"]);

  const createPost = (authorId: unknown, title: string) =>
    Post.create({ author_id: authorId, title, body: "body" });
  const createComment = (post: Base, body: string, origin: Base | null = null) =>
    Comment.create({
      post_id: post.id,
      body,
      origin_id: origin?.id ?? null,
      origin_type: origin ? "Member" : null,
    });

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("scope(association) returns a sync Relation loadable via toArray", async () => {
    const author = await Author.create({ name: "A" });
    const post = await createPost(author.id, "p");
    await createComment(post, "c1");
    await createComment(post, "c2");

    const reflection = (Author as any)._reflectOnAssociation("noJoinsComments");
    const built = DisableJoinsAssociationScope.create().scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as DisableJoinsAssociationRelation<Base>;
    expect(built).not.toBeInstanceOf(DisableJoinsAssociationRelation);
    expect(built.toSql()).toMatch(/post_id\W+IN \(SELECT \W?posts\W+id\W+FROM/);

    const records = await built;
    expect(records.map((r: any) => r.body).sort()).toEqual(["c1", "c2"]);
  });

  it("issues per-step queries (no multi-table JOIN actually emitted to the DB)", async () => {
    const author = await Author.create({ name: "A" });
    const post = await createPost(author.id, "p");
    await createComment(post, "c1");

    const reflection = (Author as any)._reflectOnAssociation("noJoinsComments");
    const built = DisableJoinsAssociationScope.create().scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as DisableJoinsAssociationRelation<Base>;

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const records = await built;
      expect(records.length).toBe(1);
      expect((records[0] as any).body).toBe("c1");
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });

  it("chained .where() on the deferred DJAR composes into the walker result", async () => {
    const author = await Author.create({ name: "A" });
    const post = await createPost(author.id, "p");
    await createComment(post, "include-me");
    await createComment(post, "exclude-me");

    const reflection = (Author as any)._reflectOnAssociation("noJoinsComments");
    const built = DisableJoinsAssociationScope.create().scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as any;
    const filtered = built.where({ body: "include-me" });
    const records = await filtered.toArray();
    expect(records.map((r: any) => r.body)).toEqual(["include-me"]);
  });

  it("loadHasMany routes disableJoins:true through DJAS", async () => {
    const author = await Author.create({ name: "A" });
    const post = await createPost(author.id, "p");
    await createComment(post, "hi");

    const reflection = (Author as any)._reflectOnAssociation("noJoinsComments");
    const comments = (await author.association("noJoinsComments").loadTarget()) as Base[];
    expect(comments.map((c: any) => c.body)).toEqual(["hi"]);
  });

  it("wraps source step in DisableJoinsAssociationRelation when upstream chain is ordered", async () => {
    const author = await Author.create({ name: "A" });
    const postB = await createPost(author.id, "b");
    const postA = await createPost(author.id, "a");
    await createComment(postB, "b", await Member.create({ name: "from-b" }));
    await createComment(postA, "a", await Member.create({ name: "from-a" }));

    const reflection = (Author as any)._reflectOnAssociation("noJoinsMembers");
    const built = DisableJoinsAssociationScope.create().scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as DisableJoinsAssociationRelation<Base>;

    const records = await built;
    expect(records.map((r: any) => r.name)).toEqual(["from-a", "from-b"]);
  });

  it("limit on the ordered-upstream wrap case slices AFTER reorder (no SQL LIMIT before IN-list ordering)", async () => {
    const author = await Author.create({ name: "A" });
    const postB = await createPost(author.id, "b");
    const postA = await createPost(author.id, "a");
    await createComment(postB, "b", await Member.create({ name: "from-b" }));
    await createComment(postA, "a", await Member.create({ name: "from-a" }));

    const reflection = (Author as any)._reflectOnAssociation("noJoinsMembers");
    const built = DisableJoinsAssociationScope.create().scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as DisableJoinsAssociationRelation<Base>;

    await expect(built.limit(-1)).rejects.toThrow("attempt to take negative size");
    await expect(built.limit(NaN)).rejects.toThrow("float NaN out of range of integer");
    await expect(built.first(1)).rejects.toThrow(
      "undefined method 'limit' for an instance of Array",
    );
    const limited = built.limit(1) as Promise<Base[]> | DisableJoinsAssociationRelation<Base>;
    const records = await limited;
    expect(records.length).toBe(1);
    expect((records[0] as any).name).toBe("from-a");
  });

  it("DisableJoinsAssociationRelation is exported and reorders by ids on load", async () => {
    const post1 = await createPost(1, "p1");
    const post2 = await createPost(1, "p2");

    const djar = new DisableJoinsAssociationRelation(Post, "id", [post2.id, post1.id]);
    (djar as any).whereClause.predicates.push(
      ...(Post as any).where({ id: [post1.id, post2.id] }).whereClause.predicates,
    );
    const loaded = await djar;
    expect(loaded.map((p: any) => p.title)).toEqual(["p2", "p1"]);
  });

  it("the id-order regroup is visible through records() and load()", async () => {
    const post1 = await createPost(2, "p1");
    const post2 = await createPost(2, "p2");
    const seed = () => {
      const djar = new DisableJoinsAssociationRelation(Post, "id", [post2.id, post1.id]);
      (djar as any).whereClause.predicates.push(
        ...(Post as any).where({ id: [post1.id, post2.id] }).whereClause.predicates,
      );
      return djar;
    };

    const viaRecords = seed();
    expect((await viaRecords.records()).map((p: any) => p.title)).toEqual(["p2", "p1"]);
    expect(viaRecords.isLoaded).toBe(true);

    const viaLoad = seed();
    await viaLoad.load();
    expect(viaLoad.isLoaded).toBe(true);
    expect((await viaLoad.records()).map((p: any) => p.title)).toEqual(["p2", "p1"]);

    const viaToArray = seed();
    expect((await viaToArray).map((p: any) => p.title)).toEqual(["p2", "p1"]);
    expect(viaToArray.isLoaded).toBe(true);
  });
  it("a malformed composite join id raises the predicate builder's Array expectation", () => {
    expect(() => Post.where(new Map([[["author_id", "title"], [1]]]))).toThrow(
      'Expected corresponding value for ["author_id", "title"] to be an Array',
    );
  });
});
