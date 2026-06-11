/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, association, registerModel } from "../index.js";
import { Associations } from "../associations.js";

import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Project } from "../test-helpers/models/project.js";
import { Developer, AuditLog } from "../test-helpers/models/developer.js";

registerModel(Project);
registerModel(Developer);
// Developer#before_create builds an `audit_logs` record, autosaved on create.
registerModel(AuditLog);

// ==========================================================================
// AssociationCallbacksTest — targets associations/callbacks_test.rb
// ==========================================================================
describe("AssociationCallbacksTest", () => {
  let adapter: TestDatabaseAdapter;
  let cbIdx = 0;
  function makePostWithCallbacks(callbacks: any) {
    const idx = ++cbIdx;
    const commentName = `CBComment${idx}`;
    const postName = `CBPost${idx}`;
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    Comment.adapter = adapter;
    Post.adapter = adapter;
    Associations.hasMany.call(Post, "comments", {
      className: commentName,
      foreignKey: "post_id",
      ...callbacks,
    });
    registerModel(commentName, Comment);
    registerModel(postName, Post);
    return { Post, Comment };
  }

  beforeAll(async () => {
    adapter = createTestAdapter();
    // Minimal throwaway posts/comments for the add/remove callback mechanics;
    // canonical posts/comments require NOT NULL body that these models don't set
    // (see memory `assoc_callbacks_fixture_parity_blocked`), so they stay local.
    /* eslint-disable blazetrails/require-canonical-schema */
    await defineSchema(adapter, {
      comments: { body: "string", post_id: "integer" },
      posts: { title: "string" },
    });
    /* eslint-enable blazetrails/require-canonical-schema */
  });
  withTransactionalFixtures(() => adapter);

  it("adding macro callbacks", async () => {
    const log: string[] = [];
    // "macro" style: callback defined as a named function (equivalent to Ruby's method name symbol)
    function onAdd(_owner: any, record: any) {
      log.push("macro:add:" + record.body);
    }
    const { Post, Comment } = makePostWithCallbacks({ afterAdd: onAdd });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Hello", post_id: post.id });
    await proxy.push(c);
    expect(log).toContain("macro:add:Hello");
  });

  it("adding with proc callbacks", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + record.body);
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.body);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "World", post_id: post.id });
    await proxy.push(c);
    expect(log).toContain("before:World");
    expect(log).toContain("after:World");
  });

  it("removing with macro callbacks", async () => {
    const log: string[] = [];
    function onRemove(_owner: any, record: any) {
      log.push("macro:remove:" + record.body);
    }
    const { Post, Comment } = makePostWithCallbacks({ afterRemove: onRemove });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "ToRemove", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toContain("macro:remove:ToRemove");
  });

  it("removing with proc callbacks", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      beforeRemove: (_owner: any, record: any) => {
        log.push("before:remove:" + record.body);
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("after:remove:" + record.body);
      },
    });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "Bye", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toContain("before:remove:Bye");
    expect(log).toContain("after:remove:Bye");
  });

  it("multiple callbacks", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      beforeAdd: (_owner: any, _record: any) => {
        log.push("b1");
      },
      afterAdd: (_owner: any, _record: any) => {
        log.push("a1");
      },
      beforeRemove: (_owner: any, _record: any) => {
        log.push("br1");
      },
      afterRemove: (_owner: any, _record: any) => {
        log.push("ar1");
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Multi", post_id: post.id });
    await proxy.push(c);
    expect(log).toContain("b1");
    expect(log).toContain("a1");

    const c2 = await (Comment as any).create({ body: "Del", post_id: post.id });
    await proxy.delete(c2);
    expect(log).toContain("br1");
    expect(log).toContain("ar1");
  });
});

describe("AssociationCallbacksTest", () => {
  let adapter: TestDatabaseAdapter;
  let cbIdx = 0;
  function makePostWithCallbacks(callbacks: any) {
    const idx = ++cbIdx;
    const commentName = `CBComment${idx}`;
    const postName = `CBPost${idx}`;
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    Comment.adapter = adapter;
    Post.adapter = adapter;
    Associations.hasMany.call(Post, "comments", {
      className: commentName,
      foreignKey: "post_id",
      ...callbacks,
    });
    registerModel(commentName, Comment);
    registerModel(postName, Post);
    return { Post, Comment };
  }

  beforeAll(async () => {
    adapter = createTestAdapter();
    // Minimal throwaway tables for the add/remove association-callback mechanics:
    // the local Post/Comment/Profile/Client models create rows the canonical
    // shapes can't accept (canonical posts/comments require NOT NULL body), so
    // these stay test-local — see memory `assoc_callbacks_fixture_parity_blocked`.
    /* eslint-disable blazetrails/require-canonical-schema */
    await defineSchema(adapter, {
      comments: { body: "string", post_id: "integer" },
      posts: { title: "string" },
      profiles: { bio: "string", user_id: "integer" },
      users: { name: "string" },
      clients: { name: "string", firm_id: "integer" },
      firms: { name: "string" },
    });
    /* eslint-enable blazetrails/require-canonical-schema */
  });
  withTransactionalFixtures(() => adapter);

  it("add callback on has many", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        log.push("added:" + (record.id ?? "<new>"));
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Hello", post_id: post.id });
    await proxy.push(c);
    expect(log.length).toBe(1);
    expect(log[0]).toMatch(/^added:/);
  });

  it("remove callback on has many", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      afterRemove: (_owner: any, record: any) => {
        log.push("removed:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "Bye", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log.length).toBe(1);
    expect(log[0]).toBe("removed:" + c.id);
  });

  it("add callback on has many with proc", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Proc", post_id: post.id });
    await proxy.push(c);
    expect(log[0]).toMatch(/^before:/);
    expect(log[1]).toMatch(/^after:/);
  });

  it("add callback on has many with string", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        log.push("string_cb:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Str", post_id: post.id });
    await proxy.push(c);
    expect(log.length).toBe(1);
  });

  it("add callback on has one", async () => {
    const log: string[] = [];
    const idx = ++cbIdx;
    class Profile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("user_id", "integer");
      }
    }
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Profile.adapter = adapter;
    User.adapter = adapter;
    registerModel(`HOProfile${idx}`, Profile);
    registerModel(`HOUser${idx}`, User);
    Associations.hasMany.call(User, "profiles", {
      className: `HOProfile${idx}`,
      foreignKey: "user_id",
      afterAdd: (_owner: any, record: any) => {
        log.push("added:" + (record.id ?? "<new>"));
      },
    });
    const user = await User.create({ name: "Alice" });
    const proxy = association(user, "profiles");
    const profile = proxy.build({ bio: "Hello" });
    expect(log.length).toBe(1);
    expect(log[0]).toBe("added:<new>");
  });

  it("remove callback on has one", async () => {
    const log: string[] = [];
    const idx = ++cbIdx;
    class Profile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("user_id", "integer");
      }
    }
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    Profile.adapter = adapter;
    User.adapter = adapter;
    registerModel(`HORProfile${idx}`, Profile);
    registerModel(`HORUser${idx}`, User);
    Associations.hasMany.call(User, "profiles", {
      className: `HORProfile${idx}`,
      foreignKey: "user_id",
      beforeRemove: (_owner: any, record: any) => {
        log.push("removing:" + record.id);
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("removed:" + record.id);
      },
    });
    const user = await User.create({ name: "Bob" });
    const profile = await Profile.create({ bio: "Hi", user_id: user.id });
    const proxy = association(user, "profiles");
    await proxy.delete(profile);
    expect(log).toEqual(["removing:" + profile.id, "removed:" + profile.id]);
  });

  it("add callback fires before save", async () => {
    let wasNew: boolean | undefined;
    const { Post, Comment } = makePostWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        wasNew = record.isNewRecord();
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "New", post_id: post.id });
    await proxy.push(c);
    expect(wasNew).toBe(true);
  });

  it("add callback fires after save", async () => {
    let wasNew: boolean | undefined;
    const { Post, Comment } = makePostWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        wasNew = record.isNewRecord();
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Saved", post_id: post.id });
    await proxy.push(c);
    expect(wasNew).toBe(false);
  });

  it("before add throwing abort prevents add", async () => {
    const { Post, Comment } = makePostWithCallbacks({
      beforeAdd: () => false as const,
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Blocked", post_id: post.id });
    await proxy.push(c);
    const comments = await proxy.toArray();
    expect(comments.length).toBe(0);
  });

  it("after add is called after adding to collection", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Confirm", post_id: post.id });
    await proxy.push(c);
    expect(log.length).toBe(1);
    expect(c.id).toBeDefined();
    expect(log[0]).toBe("after:" + c.id);
  });

  it("before remove callback", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      beforeRemove: (_owner: any, record: any) => {
        log.push("before_remove:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "Del", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toEqual(["before_remove:" + c.id]);
  });

  it("after remove callback", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      afterRemove: (_owner: any, record: any) => {
        log.push("after_remove:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "Del", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toEqual(["after_remove:" + c.id]);
  });

  it("has many callbacks", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
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
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c1 = new (Comment as any)({ body: "C1", post_id: post.id });
    await proxy.push(c1);
    expect(log).toContain("ba:<new>");
    expect(log).toContain("aa:" + c1.id);

    const c2 = await (Comment as any).create({ body: "C2", post_id: post.id });
    await proxy.delete(c2);
    expect(log).toContain("br:" + c2.id);
    expect(log).toContain("ar:" + c2.id);
  });

  it("has many callbacks with create", async () => {
    const log: string[] = [];
    const { Post } = makePostWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = await proxy.create({ body: "Created" });
    expect(log[0]).toBe("before:<new>");
    expect(log[1]).toBe("after:" + c.id);
  });

  it("has many callbacks with build", async () => {
    const log: string[] = [];
    const { Post } = makePostWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + (record.id ?? "<new>"));
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    proxy.build({ body: "Built" });
    expect(log).toEqual(["before:<new>", "after:<new>"]);
  });

  it("before add abort prevents create from saving", async () => {
    const { Post, Comment } = makePostWithCallbacks({
      beforeAdd: () => false as const,
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = await proxy.create({ body: "Blocked" });
    expect(c.isNewRecord()).toBe(true);
    const all = await (Comment as any).all().toArray();
    expect(all.length).toBe(0);
  });

  it("has many callbacks halt execution when abort is trown when adding to association", async () => {
    const { Post, Comment } = makePostWithCallbacks({ beforeAdd: () => false as const });
    const post = await Post.create({ title: "hello" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "abc", post_id: post.id });
    await proxy.push(c);
    expect((await proxy.toArray()).length).toBe(0);
  });

  it("has many callbacks halt execution when abort is trown when removing from association", async () => {
    const { Post, Comment } = makePostWithCallbacks({ beforeRemove: () => false as const });
    const post = await Post.create({ title: "hello" });
    const c = await (Comment as any).create({ body: "abc", post_id: post.id });
    const proxy = association(post, "comments");
    expect((await proxy.toArray()).length).toBe(1);
    await proxy.delete(c);
    expect((await proxy.toArray()).length).toBe(1);
  });

  it("has many callbacks with create!", async () => {
    const log: string[] = [];
    const { Post } = makePostWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before_adding" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after_adding" + record.id);
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = await proxy.createBang({ body: "Hello" });
    expect(log).toEqual(["before_adding<new>", "after_adding" + c.id]);
  });

  it("has many callbacks for save on parent", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before_adding" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after_adding" + (record.id ?? "<new>"));
      },
    });
    const post = new (Post as any)({ title: "Jack" });
    const proxy = association(post, "comments");
    proxy.build({ body: "Call me back!" });
    expect(log).toEqual(["before_adding<new>", "after_adding<new>"]);
    expect(await post.save()).toBe(true);
    expect((await (Comment as any).all().toArray()).length).toBe(1);
    expect(log).toEqual(["before_adding<new>", "after_adding<new>"]);
  });

  it("has many callbacks for destroy on parent", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      dependent: "destroy",
      beforeRemove: (_owner: any, record: any) => {
        log.push("before_remove" + record.id);
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("after_remove" + record.id);
      },
    });
    const post = await Post.create({ title: "Firm" });
    const comment = await (Comment as any).create({ body: "Client", post_id: post.id });
    await post.destroy();

    expect(log).toEqual(["before_remove" + comment.id, "after_remove" + comment.id]);
  });

  it("dont add if before callback raises exception", async () => {
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks({
      beforeAdd: () => {
        log.push("before");
        throw new Error("nope");
      },
    });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "blocked", post_id: post.id });
    try {
      await proxy.push(c);
    } catch {
      // swallowed, like Rails' `rescue Exception`
    }
    expect((await proxy.toArray()).length).toBe(0);
  });
});

// ==========================================================================
// HABTM callback tests migrated to the canonical Project / Developer models
// (whose `developersWithCallbacks` association carries the Rails before/after
// add+remove callbacks logging to `developersLog`) + real projects/developers
// fixture lookups, mirroring `AssociationCallbacksTest`'s
// `developers(:david)` / `projects(:active_record)` rows joined via the
// developers_projects fixtures.
// ==========================================================================
describe("AssociationCallbacksTest", () => {
  const { projects, developers } = useHandlerFixtures(
    ["projects", "developers", "developersProjects"],
    { schema: canonicalSchema },
  );
  // The fixture-schema slice only creates the tables the fixtures touch;
  // creating a Developer autosaves an `audit_logs` row (its `before_create`),
  // so that table must exist too.
  beforeAll(async () => {
    await defineSchema(Base.connection as TestDatabaseAdapter, {
      audit_logs: canonicalSchema.audit_logs,
    });
  });

  it("has and belongs to many add callback", async () => {
    const david = developers("david");
    const ar = projects("active_record");
    expect(ar.developersLog).toEqual([]);
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
    // Rails uses a throwaway `Class.new(Project)` on the `projects` table with a
    // closure-capturing before_add; the closure proves the added record is still
    // new inside the callback but persisted afterwards.
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
    expect(newDev).toBe(true);
    expect(alice.isNewRecord()).toBe(false);
  });

  it("has and belongs to many after add called after save", async () => {
    const ar = projects("active_record");
    expect(ar.developersLog).toEqual([]);
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
    expect(activerecord.developersLog).toEqual([]);
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
    expect(activerecord.developersLog).toEqual([]);
    const proxy = association(activerecord, "developersWithCallbacks");
    // david + jamis (+ poor_jamis) are joined to active_record via the
    // developers_projects fixtures, so clear() actually removes rows — and
    // must do so without firing the before/after remove callbacks.
    expect((await proxy.toArray()).length).toBeGreaterThan(0);
    await proxy.clear();
    expect(activerecord.developersLog).toEqual([]);
  });

  it("has and belongs to many callbacks for save on parent", async () => {
    const project = new Project({ name: "Callbacks" });
    const proxy = association(project, "developersWithCallbacks");
    proxy.build({ name: "Jack", salary: 95000 });

    const callbackLog = ["before_adding<new>", "after_adding<new>"];
    expect(project.developersLog).toEqual(callbackLog);
    expect(await project.save()).toBe(true);
    expect((await proxy.toArray()).length).toBe(1);
    expect(project.developersLog).toEqual(callbackLog);
  });
});
