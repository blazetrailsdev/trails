import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { registerModel } from "../index.js";

import { assertEmpty } from "@blazetrails/activesupport";
import { fixtures } from "../test-helpers/use-fixtures.js";
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

  it("has many callbacks with create!", async () => {
    const morten = await Author.createBang({ name: "Morten" });
    const post = await (morten as any).postsWithProcCallbacks.create({
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
      `after_adding${(await (jack as any).postsWithCallbacks.first()).id ?? ""}`,
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
  fixtures({});
  beforeAll(async () => {
    registerModel(Company);
    registerModel(Firm);
    registerModel(Client);
    registerModel(Account);
    Company.inheritanceColumn = "type";
    registerModel(Firm);
    registerModel(Client);
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
    const proxy = ar.developersWithCallbacks;
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
    const klass = class extends Project {
      static override get name() {
        return Project.name;
      }
      static {
        this.hasAndBelongsToMany("developersWithCallbacks", {
          className: "Developer",
          beforeAdd: (_o: any, r: any) => {
            dev = r;
            newDev = r.isNewRecord();
          },
        });
      }
    };
    const rec = await klass.createBang();
    const alice = new Developer({ name: "alice" });
    await rec.developersWithCallbacks.push(alice);
    expect(dev).toBe(alice);
    expect(newDev).toBeDefined();
    expect(newDev).toBeTruthy();
    expect(alice.isNewRecord()).toBeFalsy();
  });

  it("has and belongs to many after add called after save", async () => {
    const ar = projects("active_record");
    assertEmpty(ar.developersLog);
    const proxy = ar.developersWithCallbacks;

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
    const proxy = activerecord.developersWithCallbacks;
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
    const proxy = activerecord.developersWithCallbacks;
    // eslint-disable-next-line blazetrails/no-conditional-in-test
    if ((await proxy.size()) === 0) {
      await activerecord.developers.push(developers("david"));
      await activerecord.developers.push(developers("jamis"));
      await activerecord.reload();
      expect((await proxy.size()) === 2).toBeTruthy();
    }
    (await proxy).flatMap((d: any) => [`before_removing${d.id}`, `after_removing${d.id}`]).sort();
    expect(await proxy.clear()).toBeTruthy();
    assertEmpty(activerecord.developersLog);
  });

  it("has and belongs to many callbacks for save on parent", async () => {
    const project = new Project({ name: "Callbacks" });
    const proxy = project.developersWithCallbacks;
    proxy.build({ name: "Jack", salary: 95000 });

    const callbackLog = ["before_adding<new>", "after_adding<new>"];
    expect(project.developersLog).toEqual(callbackLog);
    expect(await project.save()).toBeTruthy();
    expect((await proxy).length).toBe(1);
    expect(project.developersLog).toEqual(callbackLog);
  });
});
