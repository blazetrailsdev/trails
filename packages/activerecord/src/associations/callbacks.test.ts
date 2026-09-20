import { kernelThrow } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  Base,
  collectionProxyFor as association,
  registerModel,
  registerSubclass,
} from "../index.js";

import { assertEmpty } from "@blazetrails/activesupport";
import { fixtures } from "../test-fixtures.js";
import { Project } from "../test-helpers/models/project.js";
import { Developer, AuditLog } from "../test-helpers/models/developer.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Company, Firm, Client } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";

registerModel(Project);
registerModel(Developer);
registerModel(AuditLog);
registerModel(Author);
registerModel(Post);

let cbIdx = 0;

function makeAuthorWithCallbacks(callbacks: any) {
  const idx = ++cbIdx;
  class CbAuthor extends Base {
    static {
      this.tableName = "authors";
      this.attribute("name", "string");
      this.hasMany("posts", {
        className: "Post",
        foreignKey: "author_id",
        ...callbacks,
      });
    }
  }
  registerModel(`AuthorWithCallbacks${idx}`, CbAuthor);
  return { Author: CbAuthor, Post };
}

function setupAuthorPostSuite(): void {
  fixtures({});
}

describe("AssociationCallbacksTest", () => {
  const { authors, posts } = fixtures(["authors", "posts"]);
  let david: any;
  let thinking: any;
  let authorless: any;

  beforeEach(() => {
    david = authors("david");
    thinking = posts("thinking");
    authorless = posts("authorless");
    assertEmpty(david.postLog);
  });

  it("adding macro callbacks", async () => {
    await david.postsWithCallbacks.push(thinking);
    expect(david.postLog).toEqual([`before_adding${thinking.id}`, `after_adding${thinking.id}`]);
    await david.postsWithCallbacks.push(thinking);
    expect(david.postLog).toEqual([
      `before_adding${thinking.id}`,
      `after_adding${thinking.id}`,
      `before_adding${thinking.id}`,
      `after_adding${thinking.id}`,
    ]);
  });

  it("adding with proc callbacks", async () => {
    await david.postsWithProcCallbacks.push(thinking);
    expect(david.postLog).toEqual([`before_adding${thinking.id}`, `after_adding${thinking.id}`]);
    await david.postsWithProcCallbacks.push(thinking);
    expect(david.postLog).toEqual([
      `before_adding${thinking.id}`,
      `after_adding${thinking.id}`,
      `before_adding${thinking.id}`,
      `after_adding${thinking.id}`,
    ]);
  });

  it("removing with macro callbacks", async () => {
    const [firstPost, secondPost] = (await david.postsWithCallbacks.toArray()).slice(0, 2);
    await david.postsWithCallbacks.delete(firstPost);
    expect(david.postLog).toEqual([
      `before_removing${firstPost.id}`,
      `after_removing${firstPost.id}`,
    ]);
    await david.postsWithCallbacks.delete(secondPost);
    expect(david.postLog).toEqual([
      `before_removing${firstPost.id}`,
      `after_removing${firstPost.id}`,
      `before_removing${secondPost.id}`,
      `after_removing${secondPost.id}`,
    ]);
  });

  it("removing with proc callbacks", async () => {
    const [firstPost, secondPost] = (await david.postsWithCallbacks.toArray()).slice(0, 2);
    await david.postsWithProcCallbacks.delete(firstPost);
    expect(david.postLog).toEqual([
      `before_removing${firstPost.id}`,
      `after_removing${firstPost.id}`,
    ]);
    await david.postsWithProcCallbacks.delete(secondPost);
    expect(david.postLog).toEqual([
      `before_removing${firstPost.id}`,
      `after_removing${firstPost.id}`,
      `before_removing${secondPost.id}`,
      `after_removing${secondPost.id}`,
    ]);
  });

  it("multiple callbacks", async () => {
    await david.postsWithMultipleCallbacks.push(thinking);
    expect(david.postLog).toEqual([
      `before_adding${thinking.id}`,
      `before_adding_proc${thinking.id}`,
      `after_adding${thinking.id}`,
      `after_adding_proc${thinking.id}`,
    ]);
    await david.postsWithMultipleCallbacks.push(thinking);
    expect(david.postLog).toEqual([
      `before_adding${thinking.id}`,
      `before_adding_proc${thinking.id}`,
      `after_adding${thinking.id}`,
      `after_adding_proc${thinking.id}`,
      `before_adding${thinking.id}`,
      `before_adding_proc${thinking.id}`,
      `after_adding${thinking.id}`,
      `after_adding_proc${thinking.id}`,
    ]);
  });

  it("has many callbacks halt execution when abort is trown when adding to association", async () => {
    const author = await Author.createBang({ name: "Roger" });
    const post = await Post.createBang({ title: "hello", body: "abc" });
    await (author as any).postsWithThrownCallbacks.push(post);

    assertEmpty(await (author as any).postsWithCallbacks.toArray());
  });

  it("has many callbacks halt execution when abort is trown when removing from association", async () => {
    const author = await Author.createBang({ name: "Roger" });
    const post = await Post.createBang({ title: "hello", body: "abc", author });

    expect(await (author as any).postsWithThrownCallbacks.size()).toBe(1);
    await (author as any).postsWithThrownCallbacks.destroy(post.id);
    expect(await (author as any).postsWithThrownCallbacks.size()).toBe(1);
  });

  it("has many callbacks with create", async () => {
    const morten = await Author.create({ name: "Morten" });
    const post = await (morten as any).postsWithProcCallbacks.createBang({
      title: "Hello",
      body: "How are you doing?",
    });
    expect((morten as any).postLog).toEqual(["before_adding<new>", `after_adding${post.id}`]);
  });

  it("has many callbacks for save on parent", async () => {
    const jack = new Author({ name: "Jack" });
    (jack as any).postsWithCallbacks.build({
      title: "Call me back!",
      body: "Before you wake up and after you sleep",
    });

    const callbackLog = [
      "before_adding<new>",
      `after_adding${(await (jack as any).postsWithCallbacks.first()).id}`,
    ];
    expect((jack as any).postLog).toEqual(callbackLog);
    expect(await jack.save()).toBeTruthy();
    expect(await (jack as any).postsWithCallbacks.count()).toBe(1);
    expect((jack as any).postLog).toEqual(callbackLog);
  });

  it("dont add if before callback raises exception", async () => {
    const unchangeablePostIds = async (): Promise<unknown[]> =>
      (await david.unchangeablePosts.toArray()).map((p: any) => p.id);

    expect(await unchangeablePostIds()).not.toContain(authorless.id);
    try {
      await david.unchangeablePosts.push(authorless);
    } catch {}
    assertEmpty(david.postLog);
    expect(await unchangeablePostIds()).not.toContain(authorless.id);
    await david.reload();
    expect(await unchangeablePostIds()).not.toContain(authorless.id);
  });
});

describe("AssociationCallbacksTest", () => {
  setupAuthorPostSuite();

  it("add callback on has many", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        log.push("added:" + (record.id ?? "<new>"));
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Hello", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(log.length).toBe(1);
    expect(log[0]).toMatch(/^added:/);
  });

  it("remove callback on has many", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      afterRemove: (_owner: any, record: any) => {
        log.push("removed:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const p = await (Post as any).create({ title: "Bye", body: "Body", author_id: author.id });
    const proxy = association(author, "posts");
    await proxy.delete(p);
    expect(log.length).toBe(1);
    expect(log[0]).toBe("removed:" + p.id);
  });

  it("add callback on has many with proc", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Proc", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(log[0]).toMatch(/^before:/);
    expect(log[1]).toMatch(/^after:/);
  });

  it("add callback on has many with string", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        log.push("string_cb:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Str", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(log.length).toBe(1);
  });

  it("add callback on has one", async () => {
    const log: string[] = [];
    const { Author } = makeAuthorWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        log.push("added:" + (record.id ?? "<new>"));
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    proxy.build({ title: "Hello", body: "Body" });
    expect(log.length).toBe(1);
    expect(log[0]).toBe("added:<new>");
  });

  it("remove callback on has one", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeRemove: (_owner: any, record: any) => {
        log.push("removing:" + record.id);
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("removed:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const p = await (Post as any).create({ title: "Hi", body: "Body", author_id: author.id });
    const proxy = association(author, "posts");
    await proxy.delete(p);
    expect(log).toEqual(["removing:" + p.id, "removed:" + p.id]);
  });

  it("add callback fires before save", async () => {
    let wasNew: boolean | undefined;
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        wasNew = record.isNewRecord();
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "New", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(wasNew).toBe(true);
  });

  it("add callback fires after save", async () => {
    let wasNew: boolean | undefined;
    const { Author, Post } = makeAuthorWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        wasNew = record.isNewRecord();
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Saved", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(wasNew).toBe(false);
  });

  it("before add throwing abort prevents add", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: () => kernelThrow(":abort"),
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Blocked", body: "Body", author_id: author.id });
    await proxy.push(p);
    const posts = await proxy;
    expect(posts.length).toBe(0);
  });

  it("after add is called after adding to collection", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Confirm", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(log.length).toBe(1);
    expect(p.id).toBeDefined();
    expect(log[0]).toBe("after:" + p.id);
  });

  it("before remove callback", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeRemove: (_owner: any, record: any) => {
        log.push("before_remove:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const p = await (Post as any).create({ title: "Del", body: "Body", author_id: author.id });
    const proxy = association(author, "posts");
    await proxy.delete(p);
    expect(log).toEqual(["before_remove:" + p.id]);
  });

  it("after remove callback", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      afterRemove: (_owner: any, record: any) => {
        log.push("after_remove:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const p = await (Post as any).create({ title: "Del", body: "Body", author_id: author.id });
    const proxy = association(author, "posts");
    await proxy.delete(p);
    expect(log).toEqual(["after_remove:" + p.id]);
  });

  it("has many callbacks", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("ba:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("aa:" + record.id);
      },
      beforeRemove: (_owner: any, record: any) => {
        log.push("br:" + record.id);
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("ar:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p1 = new (Post as any)({ title: "C1", body: "Body", author_id: author.id });
    await proxy.push(p1);
    expect(log).toContain("ba:<new>");
    expect(log).toContain("aa:" + p1.id);

    const p2 = await (Post as any).create({ title: "C2", body: "Body", author_id: author.id });
    await proxy.delete(p2);
    expect(log).toContain("br:" + p2.id);
    expect(log).toContain("ar:" + p2.id);
  });

  it("has many callbacks with build", async () => {
    const log: string[] = [];
    const { Author } = makeAuthorWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + (record.id ?? "<new>"));
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    proxy.build({ title: "Built", body: "Body" });
    expect(log).toEqual(["before:<new>", "after:<new>"]);
  });

  it("before add abort prevents create from saving", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: () => kernelThrow(":abort"),
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = await proxy.create({ title: "Blocked", body: "Body" });
    expect(p.isNewRecord()).toBe(true);
    const all = await (Post as any).where({ author_id: author.id }).toArray();
    expect(all.length).toBe(0);
  });

  it("before_remove abort halts the whole removal, not just the current record", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeRemove: (_owner: any, record: any) => {
        if (record.title === "keep") kernelThrow(":abort");
      },
    });
    const author = await Author.create({ name: "David" });
    const p1 = await (Post as any).create({
      title: "removable",
      body: "Body",
      author_id: author.id,
    });
    const p2 = await (Post as any).create({ title: "keep", body: "Body", author_id: author.id });
    const proxy = association(author, "posts");
    expect((await proxy).length).toBe(2);
    await proxy.delete(p1, p2);
    expect((await proxy).length).toBe(2);
  });

  it("has many callbacks with create!", async () => {
    const log: string[] = [];
    const { Author } = makeAuthorWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before_adding" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after_adding" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = await proxy.createBang({ title: "Hello", body: "Body" });
    expect(log).toEqual(["before_adding<new>", "after_adding" + p.id]);
  });

  it("after_add callback throwing abort propagates (not swallowed)", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({
      afterAdd: () => kernelThrow(":abort"),
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "abc", body: "Body", author_id: author.id });
    await expect(proxy.push(p)).rejects.toBeDefined();
  });
});

describe("AssociationCallbacksTest", () => {
  fixtures({});
  beforeAll(async () => {
    registerModel(Company);
    registerModel(Firm);
    registerModel(Client);
    registerModel(Account);
    Company.inheritanceColumn = "type";
    registerSubclass(Firm);
    registerSubclass(Client);
  });

  it("has many callbacks for destroy on parent", async () => {
    const firm = await Firm.create({ name: "Firm" });
    const client = await firm.clients.create({ name: "Client" });
    await firm.destroy();

    expect(firm.log).toEqual([`before_remove${client.id}`, `after_remove${client.id}`]);
  });
});

describe("AssociationCallbacksTest", () => {
  const { projects, developers } = fixtures(["projects", "developers", "developersProjects"]);

  it("has and belongs to many add callback", async () => {
    const david = developers("david");
    const ar = projects("active_record");
    assertEmpty(ar.developersLog);
    const proxy = association(ar, "developersWithCallbacks");
    await proxy.push(david);
    expect(ar.developersLog).toEqual([`before_adding${david.id}`, `after_adding${david.id}`]);
    await proxy.push(david);
    expect(ar.developersLog).toEqual([
      `before_adding${david.id}`,
      `after_adding${david.id}`,
      `before_adding${david.id}`,
      `after_adding${david.id}`,
    ]);
  });

  it("has and belongs to many before add called before save", async () => {
    let dev: any = null;
    let newDev: boolean | undefined;
    class ProjectWithCallback extends Base {
      static {
        this.tableName = "projects";
        this.attribute("name", "string");
        this.hasAndBelongsToMany("developersWithCallbacks", {
          className: "Developer",
          joinTable: "developers_projects",
          foreignKey: "project_id",
          associationForeignKey: "developer_id",
          beforeAdd: (_o: any, r: any) => {
            dev = r;
            newDev = r.isNewRecord();
          },
        });
      }
    }
    registerModel("ProjectWithBeforeAddCallback", ProjectWithCallback);
    const rec = await ProjectWithCallback.create({ name: "ActiveRecord" });
    const alice = new Developer({ name: "alice" });
    await association(rec, "developersWithCallbacks").push(alice);
    expect(dev).toBe(alice);
    expect(newDev).toBeDefined();
    expect(newDev).toBeTruthy();
    expect(alice.isNewRecord()).toBeFalsy();
  });

  it("has and belongs to many after add called after save", async () => {
    const ar = projects("active_record");
    assertEmpty(ar.developersLog);
    const proxy = association(ar, "developersWithCallbacks");

    const alice = new Developer({ name: "alice" });
    await proxy.push(alice);
    expect(ar.developersLog[ar.developersLog.length - 1]).toBe(`after_adding${alice.id}`);

    const bob = await proxy.create({ name: "bob" });
    expect(ar.developersLog[ar.developersLog.length - 1]).toBe(`after_adding${bob.id}`);

    proxy.build({ name: "charlie" });
    expect(ar.developersLog[ar.developersLog.length - 1]).toBe("after_adding<new>");
  });

  it("has and belongs to many remove callback", async () => {
    const david = developers("david");
    const jamis = developers("jamis");
    const activerecord = projects("active_record");
    assertEmpty(activerecord.developersLog);
    const proxy = association(activerecord, "developersWithCallbacks");
    await proxy.delete(david);
    expect(activerecord.developersLog).toEqual([
      `before_removing${david.id}`,
      `after_removing${david.id}`,
    ]);

    await proxy.delete(jamis);
    expect(activerecord.developersLog).toEqual([
      `before_removing${david.id}`,
      `after_removing${david.id}`,
      `before_removing${jamis.id}`,
      `after_removing${jamis.id}`,
    ]);
  });

  it("has and belongs to many does not fire callbacks on clear", async () => {
    const activerecord = projects("active_record");
    assertEmpty(activerecord.developersLog);
    const proxy = association(activerecord, "developersWithCallbacks");
    // eslint-disable-next-line blazetrails/no-conditional-in-test
    if ((await proxy.size()) === 0) {
      await association(activerecord, "developers").push(developers("david"));
      await association(activerecord, "developers").push(developers("jamis"));
      await activerecord.reload();
      expect((await proxy.size()) === 2).toBeTruthy();
    }
    (await proxy).flatMap((d: any) => [`before_removing${d.id}`, `after_removing${d.id}`]).sort();
    expect(await proxy.clear()).toBeTruthy();
    assertEmpty(activerecord.developersLog);
  });

  it("has and belongs to many callbacks for save on parent", async () => {
    const project = new Project({ name: "Callbacks" });
    const proxy = association(project, "developersWithCallbacks");
    proxy.build({ name: "Jack", salary: 95000 });

    const callbackLog = ["before_adding<new>", "after_adding<new>"];
    expect(project.developersLog).toEqual(callbackLog);
    expect(await project.save()).toBeTruthy();
    expect((await proxy).length).toBe(1);
    expect(project.developersLog).toEqual(callbackLog);
  });
});
