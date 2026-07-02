import { describe, it, expect } from "vitest";
import { Base, Range, RecordNotFound, registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import {
  Developer,
  DeveloperFilteredOnJoins,
  DeveloperOrderedBySalary,
} from "../test-helpers/models/developer.js";
import { Post, FirstPost, SpecialPostWithDefaultScope } from "../test-helpers/models/post.js";
import {
  Comment,
  SpecialComment,
  SubSpecialComment,
  VerySpecialComment,
} from "../test-helpers/models/comment.js";
import { Category } from "../test-helpers/models/category.js";
import { Author } from "../test-helpers/models/author.js";
import { association } from "../associations.js";
import { Person } from "../test-helpers/models/person.js";
import { BadReference } from "../test-helpers/models/reference.js";

// The fixture-set base models (Developer, Project, Post, Comment, Category,
// Person, Reference, Author) auto-register on fixture resolution (#4348). Only
// the test-specific subclasses the fixture thunks don't return need explicit
// registration here.
registerModel(DeveloperOrderedBySalary);
registerModel(DeveloperFilteredOnJoins);
registerModel(SpecialComment);
registerModel(SubSpecialComment);
registerModel(VerySpecialComment);
registerModel(BadReference);
registerModel(FirstPost);
registerModel(SpecialPostWithDefaultScope);

const { developers, people, references, authors, comments } = fixtures([
  "developers",
  "projects",
  "developersProjects",
  "authors",
  "authorAddresses",
  "posts",
  "comments",
  "people",
  "references",
  "categories",
  "categoriesPosts",
]);

describe("RelationScopingTest", () => {
  it("unscoped breaks caching", async () => {
    const author = authors("mary");
    expect(await author.loadHasOne("firstPost")).toBeNull();
    const post = await FirstPost.unscoped(async () => {
      await author.reload();
      return author.loadHasOne("firstPost");
    });
    expect(post).not.toBeNull();
  });

  it("scope breaks caching on collections", async () => {
    let author = authors("david");
    await author.reload();
    const ids = (await association(author, "specialPostsWithDefaultScope").toArray()).map(
      (p: any) => p.id,
    );
    expect(ids.map(Number).sort((a, b) => a - b)).toEqual([1, 5, 6]);
    const scopedPosts = await SpecialPostWithDefaultScope.unscoped(async () => {
      author = authors("david");
      await author.reload();
      return association(author, "specialPostsWithDefaultScope").toArray();
    });
    const expected = (await association(author, "posts").toArray())
      .map((p: any) => p.id)
      .sort((a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0));
    expect(
      scopedPosts
        .map((p: any) => p.id)
        .sort((a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0)),
    ).toEqual(expected);
  });

  it("reverse order", async () => {
    const forward = await Developer.order("id DESC");
    const reversed = await Developer.order("id DESC").reverseOrder();
    expect(reversed.map((d: any) => d.id)).toEqual(forward.map((d: any) => d.id).reverse());
  });

  it("reverse order with arel attribute", async () => {
    const expected = await Developer.order("id DESC");
    const actual = await Developer.order(Developer.arelTable.get("id").desc()).reverseOrder();
    expect(actual.map((d: any) => d.id)).toEqual(expected.map((d: any) => d.id).reverse());
  });

  it("reverse order with arel attribute as hash", async () => {
    const expected = await Developer.order("id DESC");
    const actual = await Developer.order(
      new Map([[Developer.arelTable.get("id"), "desc" as const]]),
    ).reverseOrder();
    expect(actual.map((d: any) => d.id)).toEqual(expected.map((d: any) => d.id).reverse());
  });

  it("reverse order with arel node as hash", async () => {
    const node = Developer.arelTable.get("id").add(0);
    const expected = await Developer.order("id DESC");
    const actual = await Developer.order(new Map([[node, "desc" as const]])).reverseOrder();
    expect(actual.map((d: any) => d.id)).toEqual(expected.map((d: any) => d.id).reverse());
  });

  it("reverse order with multiple arel attributes", async () => {
    const expected = await Developer.order("id DESC").order("name DESC");
    const actual = await Developer.order(Developer.arelTable.get("id").desc())
      .order(Developer.arelTable.get("name").desc())
      .reverseOrder();
    expect(actual.map((d: any) => d.id)).toEqual(expected.map((d: any) => d.id).reverse());
  });

  it("reverse order with arel attributes and strings", async () => {
    const expected = await Developer.order("id DESC").order("name DESC");
    const actual = await Developer.order("id DESC")
      .order(Developer.arelTable.get("name").desc())
      .reverseOrder();
    expect(actual.map((d: any) => d.id)).toEqual(expected.map((d: any) => d.id).reverse());
  });

  it("double reverse order produces original order", () => {
    const original = Developer.order("name DESC").toSql();
    const doubled = Developer.order("name DESC").reverseOrder().reverseOrder().toSql();
    expect(original).toBe(doubled);
  });

  it("scoped find", async () => {
    await Developer.where("name = 'David'").scoping(async () => {
      await expect(Developer.find(1)).resolves.toBeTruthy();
    });
  });

  it("scoped find first", async () => {
    const developer = (await Developer.find(10)) as Base;
    await Developer.where("salary = 100000").scoping(async () => {
      const first = (await Developer.order("name").first()) as Base;
      expect(first.id).toBe(developer.id);
    });
  });

  it("scoped find last", async () => {
    const highestSalary = (await Developer.order("salary DESC").first()) as Base;
    await Developer.order("salary").scoping(async () => {
      expect(((await Developer.last()) as Base).id).toBe(highestSalary.id);
    });
  });

  it("scoped find last preserves scope", async () => {
    const lowestSalary = (await Developer.order("salary ASC").first()) as Base;
    const highestSalary = (await Developer.order("salary DESC").first()) as Base;
    await Developer.order("salary").scoping(async () => {
      expect(((await Developer.last()) as Base).id).toBe(highestSalary.id);
      expect(((await Developer.first()) as Base).id).toBe(lowestSalary.id);
    });
  });

  it("scoped find combines and sanitizes conditions", async () => {
    await Developer.where("salary = 9000").scoping(async () => {
      const found = (await Developer.where("name = 'Jamis'").first()) as Base;
      expect(found.id).toBe(developers("poor_jamis").id);
    });
  });

  it("scoped unscoped", async () => {
    await DeveloperOrderedBySalary.where("salary = 9000").scoping(async () => {
      expect(Number(((await DeveloperOrderedBySalary.first()) as Base).id)).toBe(11);
      expect(Number(((await DeveloperOrderedBySalary.unscoped().first()) as Base).id)).toBe(1);
    });
  });

  it("scoped default scoped", async () => {
    await DeveloperOrderedBySalary.where("salary = 9000").scoping(async () => {
      expect(Number(((await DeveloperOrderedBySalary.first()) as Base).id)).toBe(11);
      expect(Number(((await DeveloperOrderedBySalary.defaultScoped().first()) as Base).id)).toBe(2);
    });
  });

  it("scoped find all", async () => {
    await Developer.where("name = 'David'").scoping(async () => {
      const all = await Developer.all();
      expect(all.length).toBe(1);
      expect(all[0].id).toBe(developers("david").id);
    });
  });

  it("scoped find select", async () => {
    await Developer.select("id, name").scoping(async () => {
      const developer = (await Developer.where("name = 'David'").first()) as Base;
      expect(developer.name).toBe("David");
      expect(developer.hasAttribute("salary")).toBe(false);
    });
  });

  it("scope select concatenates", async () => {
    await Developer.select("id, name").scoping(async () => {
      const developer = (await Developer.select("salary").where("name = 'David'").first()) as Base;
      expect(developer.salary).toBe(80000);
      expect(developer.hasAttribute("id")).toBe(true);
      expect(developer.hasAttribute("name")).toBe(true);
      expect(developer.hasAttribute("salary")).toBe(true);
    });
  });

  it("scoped count", async () => {
    await Developer.where("name = 'David'").scoping(async () => {
      expect(await Developer.count()).toBe(1);
    });
    await Developer.where("salary = 100000").scoping(async () => {
      expect(await Developer.count()).toBe(8);
      expect(await Developer.where("name LIKE 'fixture_1%'").count()).toBe(1);
    });
  });

  it("scoped find with annotation", async () => {
    await Developer.annotate("scoped").scoping(async () => {
      const sql = Developer.where("name = 'David'").toSql();
      expect(sql).toContain("/* scoped */");
      const developer = (await Developer.where("name = 'David'").first()) as Base;
      expect(developer.name).toBe("David");
    });
  });

  it("find with annotation unscoped", async () => {
    // Rails: Developer.annotate("scoped").unscoped { ... }
    // Relation#unscoped (0-arg) delegates to klass.unscoped(); we then call
    // .scoping(callback) on that unscoped relation — the TS equivalent of
    // passing a Ruby block to Relation#unscoped.
    await Developer.annotate("scoped")
      .unscoped()
      .scoping(async () => {
        const sql = Developer.where("name = 'David'").toSql();
        expect(sql).not.toContain("/* scoped */");
        const developer = (await Developer.where("name = 'David'").first()) as Base;
        expect(developer.name).toBe("David");
      });
  });

  it("find with annotation unscope", async () => {
    const rel = Developer.annotate("unscope").where("name = 'David'").unscope("annotate");
    expect(rel.toSql()).not.toContain("/* unscope */");
    const developer = (await rel.first()) as Base;
    expect(developer.name).toBe("David");
  });

  it("scoped find include", async () => {
    const scopedDevelopers = (await Developer.includes("projects").scoping(async () =>
      Developer.where({ "projects.id": 2 }).toArray(),
    )) as Base[];
    expect(scopedDevelopers.map((d: any) => d.id)).toContain(developers("david").id);
    expect(scopedDevelopers.map((d: any) => d.id)).not.toContain(developers("jamis").id);
    expect(scopedDevelopers.length).toBe(1);
  });

  it("scoped find joins", async () => {
    const scopedDevelopers = (await Developer.joins(
      "JOIN developers_projects ON id = developer_id",
    ).scoping(async () =>
      Developer.where({ "developers_projects.project_id": 2 }).toArray(),
    )) as Base[];
    expect(scopedDevelopers.map((d: any) => d.id)).toContain(developers("david").id);
    expect(scopedDevelopers.map((d: any) => d.id)).not.toContain(developers("jamis").id);
    expect(scopedDevelopers.length).toBe(1);
  });

  it("scoped create with where", async () => {
    const newComment = await VerySpecialComment.where({ post_id: 1 }).scoping(async () =>
      VerySpecialComment.create({ body: "Wonderful world" }),
    );
    expect(newComment.post_id).toBe(1);
    const welcome = (await Post.find(1)) as Base;
    const commentIds = (await (welcome as any).comments.toArray()).map((c: any) => c.id);
    expect(commentIds).toContain(newComment.id);
  });

  it("scoped create with where with array", async () => {
    const newComment = await VerySpecialComment.where({ label: [0, 1], post_id: 1 }).scoping(
      async () => VerySpecialComment.create({ body: "Wonderful world" }),
    );
    expect(newComment.post_id).toBe(1);
    const welcome = (await Post.find(1)) as Base;
    const commentIds = (await (welcome as any).comments.toArray()).map((c: any) => c.id);
    expect(commentIds).toContain(newComment.id);
    // Rails: assert_equal "default", new_comment.label (enum cast of DB default 0).
    expect(newComment.label).toBe("default");
  });

  it("scoped create with where with range", async () => {
    const newComment = await VerySpecialComment.where({
      label: new Range(0, 1),
      post_id: 1,
    }).scoping(async () => VerySpecialComment.create({ body: "Wonderful world" }));
    expect(newComment.post_id).toBe(1);
    const welcome = (await Post.find(1)) as Base;
    const commentIds = (await (welcome as any).comments.toArray()).map((c: any) => c.id);
    expect(commentIds).toContain(newComment.id);
    // Rails: assert_equal "default", new_comment.label (enum cast of DB default 0).
    expect(newComment.label).toBe("default");
  });

  it("scoped create with create with", async () => {
    const newComment = await VerySpecialComment.createWith({ post_id: 1 }).scoping(async () =>
      VerySpecialComment.create({ body: "Wonderful world" }),
    );
    expect(newComment.post_id).toBe(1);
    const welcome = (await Post.find(1)) as Base;
    const commentIds = (await (welcome as any).comments.toArray()).map((c: any) => c.id);
    expect(commentIds).toContain(newComment.id);
  });

  it("scoped create with create with has higher priority", async () => {
    const newComment = await VerySpecialComment.where({ post_id: 2 })
      .createWith({ post_id: 1 })
      .scoping(async () => VerySpecialComment.create({ body: "Wonderful world" }));
    expect(newComment.post_id).toBe(1);
    const welcome = (await Post.find(1)) as Base;
    const commentIds = (await (welcome as any).comments.toArray()).map((c: any) => c.id);
    expect(commentIds).toContain(newComment.id);
  });

  it("ensure that method scoping is correctly restored", async () => {
    try {
      await Developer.where("name = 'Jamis'").scoping(async () => {
        throw new Error("an exception");
      });
    } catch {
      // ignore
    }
    expect(Developer.all().toSql()).not.toContain("name = 'Jamis'");
  });

  it("default scope filters on joins", async () => {
    expect(await DeveloperFilteredOnJoins.all().count()).toBe(1);
    const first = (await DeveloperFilteredOnJoins.all().first()) as Base;
    expect(first.id).toBe(developers("david").id);
  });

  it("update all default scope filters on joins", async () => {
    await DeveloperFilteredOnJoins.updateAll({ salary: 65000 });
    const david = (await Developer.find(developers("david").id)) as Base;
    expect(david.salary).toBe(65000);
    const jamis = (await Developer.find(developers("jamis").id)) as Base;
    expect(jamis.salary).not.toBe(65000);
  });

  it("delete all default scope filters on joins", async () => {
    expect(await DeveloperFilteredOnJoins.all()).not.toEqual([]);
    await DeveloperFilteredOnJoins.deleteAll();
    expect(await DeveloperFilteredOnJoins.all()).toEqual([]);
    expect(await Developer.all()).not.toEqual([]);
  });

  it("current scope does not pollute sibling subclasses", async () => {
    await Comment.none().scoping(async () => {
      expect((await SpecialComment.all()).length).toBe(0);
      expect((await VerySpecialComment.all()).length).toBe(0);
      expect((await SubSpecialComment.all()).length).toBe(0);
    });
    await SpecialComment.none().scoping(async () => {
      expect((await Comment.all()).length).toBeGreaterThan(0);
      expect((await VerySpecialComment.all()).length).toBeGreaterThan(0);
      expect((await SubSpecialComment.all()).length).toBe(0);
    });
    await SubSpecialComment.none().scoping(async () => {
      expect((await Comment.all()).length).toBeGreaterThan(0);
      expect((await VerySpecialComment.all()).length).toBeGreaterThan(0);
      expect((await SpecialComment.all()).length).toBeGreaterThan(0);
    });
  });

  it("scoping is correctly restored", async () => {
    await Comment.unscoped(async () => {
      await SpecialComment.unscoped(async () => {
        await SpecialComment.created().toArray();
      });
    });
    expect(Comment.currentScope).toBeNull();
    expect(SpecialComment.currentScope).toBeNull();
  });

  it("scoping respects current class", async () => {
    await Comment.unscoped(async () => {
      expect((Comment.all() as any).whatAreYou()).toBe("a comment...");
      expect((SpecialComment.all() as any).whatAreYou()).toBe("a special comment...");
    });
  });

  it("scoping respects sti constraint", async () => {
    await Comment.unscoped(async () => {
      const comment = (await Comment.find(1)) as Base;
      expect(Number(comment.id)).toBe(Number(comments("greetings").id));
      await expect(SpecialComment.find(1)).rejects.toThrow(RecordNotFound);
    });
  });

  it("scoping with klass method works in the scope block", async () => {
    const expected = await SpecialPostWithDefaultScope.unscoped();
    const actual = (await SpecialPostWithDefaultScope.unscopedAll()) as Base[];
    expect(actual.map((p: any) => p.id)).toEqual(expected.map((p: any) => p.id));
  });

  it("scoping with query method works in the scope block", async () => {
    const expected = await SpecialPostWithDefaultScope.unscoped().where({ author_id: 0 });
    const actual = (await SpecialPostWithDefaultScope.authorless()) as Base[];
    expect(actual.map((p: any) => p.id)).toEqual(expected.map((p: any) => p.id));
  });

  it("circular joins with scoping does not crash", async () => {
    const posts = (await Post.joins({ comments: "post" }).scoping(async () =>
      Post.first(10),
    )) as Base[];
    const expected = (await Post.joins({ comments: "post" }).first(10)) as Base[];
    expect(posts.map((p: any) => p.id)).toEqual(expected.map((p: any) => p.id));
  });

  it("circular left joins with scoping does not crash", async () => {
    const posts = (await Post.leftJoins({ comments: "post" }).scoping(async () =>
      Post.first(10),
    )) as Base[];
    const expected = (await Post.leftJoins({ comments: "post" }).first(10)) as Base[];
    expect(posts.map((p: any) => p.id)).toEqual(expected.map((p: any) => p.id));
  });

  it("scoping applies to update with all queries", async () => {
    await Author.all().limit(5).updateAll({ organization_id: "agency_1" });
    const dev = (await Author.where({ organization_id: "agency_1" }).first()) as Base;
    await Author.where({ organization_id: "agency_1" }).scoping(async () => {
      await (dev as any).update({ name: "Eileen" });
    });
    expect(((await Author.find(dev.id)) as Base).name).toBe("Eileen");
    await Author.where({ organization_id: "agency_1" }).scoping({ allQueries: true }, async () => {
      await (dev as any).update({ name: "Not Eileen" });
    });
    expect(((await Author.find(dev.id)) as Base).name).toBe("Not Eileen");
  });

  it("scoping applies to delete with all queries", async () => {
    await Author.all().limit(5).updateAll({ organization_id: "agency_1" });
    const dev1 = (await Author.where({ organization_id: "agency_1" }).first()) as Base;
    const dev2 = (await Author.where({ organization_id: "agency_1" }).last()) as Base;
    await Author.where({ organization_id: "agency_1" }).scoping(async () => {
      await (dev1 as any).delete();
    });
    await Author.where({ organization_id: "agency_1" }).scoping({ allQueries: true }, async () => {
      await (dev2 as any).delete();
    });
    expect(await Author.exists(dev1.id)).toBe(false);
    expect(await Author.exists(dev2.id)).toBe(false);
  });

  it("scoping applies to reload with all queries", async () => {
    await Author.all().limit(5).updateAll({ organization_id: "agency_1" });
    const dev1 = (await Author.where({ organization_id: "agency_1" }).first()) as Base;
    await Author.where({ organization_id: "no_match" }).scoping(async () => {
      await (dev1 as any).reload();
      expect(dev1.id).toBeTruthy();
    });
    await expect(
      Author.where({ organization_id: "no_match" }).scoping({ allQueries: true }, async () => {
        await (dev1 as any).reload();
      }),
    ).rejects.toThrow(RecordNotFound);
  });

  it("nested scoping applies with all queries set", async () => {
    await Author.all().limit(5).updateAll({ organization_id: "agency_1" });
    await Author.where({ organization_id: "agency_1" }).scoping({ allQueries: true }, async () => {
      const first = await Author.first();
      expect(first).not.toBeNull();
      await Author.where({ owned_essay_id: null }).scoping(async () => {
        const second = await Author.first();
        expect(second).not.toBeNull();
      });
      const third = await Author.first();
      expect((third as any).id).toBe((first as any).id);
    });
  });

  it("raises error if all queries is set to false while nested", async () => {
    await Author.all().limit(5).updateAll({ organization_id: "agency_1" });
    await Author.where({ organization_id: "agency_1" }).scoping({ allQueries: true }, async () => {
      const first = await Author.first();
      expect(first).not.toBeNull();
      await expect(
        Author.where({ organization_id: "agency_1" }).scoping(
          { allQueries: false },
          async () => {},
        ),
      ).rejects.toThrow(
        "Scoping is set to apply to all queries and cannot be unset in a nested block.",
      );
    });
  });
});

describe("NestedRelationScopingTest", () => {
  it("merge options", async () => {
    await Developer.where("salary = 80000").scoping(async () => {
      await Developer.limit(10).scoping(async () => {
        const sql = Developer.all().toSql();
        expect(sql).toContain("salary = 80000");
        expect(sql).toMatch(/LIMIT 10|ROWNUM <= 10|FETCH FIRST 10 ROWS ONLY/);
      });
    });
  });

  it("merge inner scope has priority", async () => {
    await Developer.limit(5).scoping(async () => {
      await Developer.limit(10).scoping(async () => {
        expect((await Developer.all()).length).toBe(10);
      });
    });
  });

  it("replace options", async () => {
    await Developer.where({ name: "David" }).scoping(async () => {
      await Developer.unscoped(async () => {
        expect(((await Developer.where({ name: "Jamis" }).first()) as Base).name).toBe("Jamis");
      });
      expect(((await Developer.first()) as Base).name).toBe("David");
    });
  });

  it("three level nested exclusive scoped find", async () => {
    await Developer.where("name = 'Jamis'").scoping(async () => {
      expect(((await Developer.first()) as any).name).toBe("Jamis");

      await Developer.unscoped()
        .where("name = 'David'")
        .scoping(async () => {
          expect(((await Developer.first()) as any).name).toBe("David");

          await Developer.unscoped()
            .where("name = 'Maiha'")
            .scoping(async () => {
              expect(await Developer.first()).toBeNull();
            });

          expect(((await Developer.first()) as any).name).toBe("David");
        });

      expect(((await Developer.first()) as any).name).toBe("Jamis");
    });
  });

  it("nested scoped create", async () => {
    const comment = await Comment.createWith({ post_id: 1 }).scoping(async () =>
      Comment.createWith({ post_id: 2 }).scoping(async () =>
        Comment.create({ body: "Hey guys, nested scopes are broken. Please fix!" }),
      ),
    );
    expect(comment.post_id).toBe(2);
  });

  it("nested exclusive scope for create", async () => {
    const comment = await Comment.createWith({
      body: "Hey guys, nested scopes are broken. Please fix!",
    }).scoping(async () =>
      Comment.unscoped()
        .createWith({ post_id: 1 })
        .scoping(async () => {
          const blank = Comment.all().build({}) as any;
          expect(blank.body).toBeFalsy();
          return Comment.create({ body: "Hey guys" });
        }),
    );
    expect(comment.post_id).toBe(1);
    expect(comment.body).toBe("Hey guys");
  });
});

describe("HasManyScopingTest", () => {
  it("should maintain default scope on associations", async () => {
    const magician = (await BadReference.find(1)) as Base;
    const michael = (await Person.find(people("michael").id)) as Base;
    const refs = await (michael as any).badReferences.toArray();
    expect(refs.map((r: any) => r.id)).toEqual([magician.id]);
  });

  it("forwarding of static methods", async () => {
    const welcome = (await Post.find(1)) as Base;
    expect((Comment as any).whatAreYou()).toBe("a comment...");
    expect(await (welcome as any).comments.whatAreYou()).toBe("a comment...");
  });

  it("forwarding to scoped", async () => {
    const welcome = (await Post.find(1)) as Base;
    expect(await (Comment as any).searchByType("Comment").size()).toBe(5);
    expect(await (welcome as any).comments.searchByType("Comment").size()).toBe(2);
  });

  it("nested scope finder", async () => {
    const welcome = (await Post.find(1)) as Base;
    await Comment.where("1=0").scoping(async () => {
      expect(await (welcome as any).comments.count()).toBe(2);
      expect(await (welcome as any).comments.whatAreYou()).toBe("a comment...");
    });
    await Comment.where("1=1").scoping(async () => {
      expect(await (welcome as any).comments.count()).toBe(2);
      expect(await (welcome as any).comments.whatAreYou()).toBe("a comment...");
    });
  });

  it("none scoping", async () => {
    const welcome = (await Post.find(1)) as Base;
    await Comment.none().scoping(async () => {
      expect(await (welcome as any).comments.count()).toBe(2);
      expect(await (welcome as any).comments.whatAreYou()).toBe("a comment...");
    });
    await Comment.where("1=1").scoping(async () => {
      expect(await (welcome as any).comments.count()).toBe(2);
      expect(await (welcome as any).comments.whatAreYou()).toBe("a comment...");
    });
  });

  it("should default scope on associations is overridden by association conditions", async () => {
    const michael = (await Person.find(people("michael").id)) as Base;
    const refs = await (michael as any).fixedBadReferences.toArray();
    expect(refs.map((r: any) => r.id)).toEqual([references("michael_unicyclist").id]);
  });

  it("should maintain default scope on eager loaded associations", async () => {
    const michael = people("michael");
    const loaded = (await Person.where({ id: michael.id })
      .includes("badReferences")
      .first()) as Base;
    const magician = (await BadReference.find(1)) as Base;
    const refs = await (loaded as any).badReferences.toArray();
    expect(refs.map((r: any) => r.id)).toEqual([magician.id]);
  });

  it("scoping applies to all queries on has many when set", async () => {
    const welcome = (await Post.find(1)) as Base;
    await (welcome as any).comments.updateAll({ author_id: 1 });

    const baseline = await (await (welcome as any).comments.reload()).toArray();
    expect(baseline.length).toBeGreaterThan(0);

    await Comment.where({ author_id: 2 }).scoping({ allQueries: true }, async () => {
      const scoped = await (await (welcome as any).comments.reload()).toArray();
      expect(scoped.length).toBe(0);
    });

    const after = await (await (welcome as any).comments.reload()).toArray();
    expect(after.length).toBe(baseline.length);
  });
});

describe("HasAndBelongsToManyScopingTest", () => {
  it("forwarding of static methods", async () => {
    const welcome = (await Post.find(1)) as Base;
    expect((Category as any).whatAreYou()).toBe("a category...");
    expect(await (welcome as any).categories.whatAreYou()).toBe("a category...");
  });

  it("nested scope finder", async () => {
    const welcome = (await Post.find(1)) as Base;
    await Category.where("1=0").scoping(async () => {
      expect(await (welcome as any).categories.count()).toBe(2);
      expect(await (welcome as any).categories.whatAreYou()).toBe("a category...");
    });
    await Category.where("1=1").scoping(async () => {
      expect(await (welcome as any).categories.count()).toBe(2);
      expect(await (welcome as any).categories.whatAreYou()).toBe("a category...");
    });
  });

  it("none scoping", async () => {
    const welcome = (await Post.find(1)) as Base;
    await Category.none().scoping(async () => {
      expect(await (welcome as any).categories.count()).toBe(2);
      expect(await (welcome as any).categories.whatAreYou()).toBe("a category...");
    });
    await Category.where("1=1").scoping(async () => {
      expect(await (welcome as any).categories.count()).toBe(2);
      expect(await (welcome as any).categories.whatAreYou()).toBe("a category...");
    });
  });
});
