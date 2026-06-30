/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, association, registerModel, enableSti, registerSubclass } from "../index.js";
import { throwAbort } from "@blazetrails/activesupport";

import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { fixtures, setupFixtures } from "../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Project } from "../test-helpers/models/project.js";
import { Developer, AuditLog } from "../test-helpers/models/developer.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Company, Firm, Client } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";

registerModel(Project);
registerModel(Developer);
// Developer#before_create builds an `audit_logs` record, autosaved on create.
registerModel(AuditLog);
// Rails' `AssociationCallbacksTest` carries the has_many add/remove callbacks
// on `Author#posts_with_callbacks` (owner = Author, child = Post). Register
// both canonical models so the throwaway owner's has_many :posts resolves.
registerModel(Author);
registerModel(Post);

let cbIdx = 0;

// A throwaway Author subclass on the canonical `authors` table carrying the
// has_many :posts add/remove callbacks under test — mirrors Rails'
// `has_many :posts_with_callbacks, class_name: "Post"` on Author, inlined per
// test (as Rails inlines `Class.new(Project)` for the HABTM callback below).
// `posts.author_id` is nullable, so the default has_many delete (nullify)
// works exactly as in Rails — no `dependent` override needed.
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

// Creates the canonical `authors`/`posts` tables on the handler connection.
// Used by the has_many callback describes below.
function setupAuthorPostSuite(): void {
  setupFixtures();
  withTransactionalFixtures(() => Base.connection);
  beforeAll(async () => {
    await defineSchema(Base.connection, {
      authors: canonicalSchema.authors,
      posts: canonicalSchema.posts,
    });
  });
}

// ==========================================================================
// AssociationCallbacksTest — targets associations/callbacks_test.rb
// ==========================================================================
describe("AssociationCallbacksTest", () => {
  setupAuthorPostSuite();

  it("adding macro callbacks", async () => {
    const log: string[] = [];
    // "macro" style: callback defined as a named function (equivalent to Ruby's method name symbol)
    function onAdd(_owner: any, record: any) {
      log.push("macro:add:" + record.title);
    }
    const { Author, Post } = makeAuthorWithCallbacks({ afterAdd: onAdd });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Hello", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(log).toContain("macro:add:Hello");
  });

  it("adding with proc callbacks", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + record.title);
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.title);
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "World", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(log).toContain("before:World");
    expect(log).toContain("after:World");
  });

  it("removing with macro callbacks", async () => {
    const log: string[] = [];
    function onRemove(_owner: any, record: any) {
      log.push("macro:remove:" + record.title);
    }
    const { Author, Post } = makeAuthorWithCallbacks({ afterRemove: onRemove });
    const author = await Author.create({ name: "David" });
    const p = await (Post as any).create({ title: "ToRemove", body: "Body", author_id: author.id });
    const proxy = association(author, "posts");
    await proxy.delete(p);
    expect(log).toContain("macro:remove:ToRemove");
  });

  it("removing with proc callbacks", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeRemove: (_owner: any, record: any) => {
        log.push("before:remove:" + record.title);
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("after:remove:" + record.title);
      },
    });
    const author = await Author.create({ name: "David" });
    const p = await (Post as any).create({ title: "Bye", body: "Body", author_id: author.id });
    const proxy = association(author, "posts");
    await proxy.delete(p);
    expect(log).toContain("before:remove:Bye");
    expect(log).toContain("after:remove:Bye");
  });

  it("multiple callbacks", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
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
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Multi", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect(log).toContain("b1");
    expect(log).toContain("a1");

    const p2 = await (Post as any).create({ title: "Del", body: "Body", author_id: author.id });
    await proxy.delete(p2);
    expect(log).toContain("br1");
    expect(log).toContain("ar1");
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
      beforeAdd: () => throwAbort(),
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "Blocked", body: "Body", author_id: author.id });
    await proxy.push(p);
    const posts = await proxy.toArray();
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

  it("has many callbacks with create", async () => {
    const log: string[] = [];
    const { Author } = makeAuthorWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.id);
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = await proxy.create({ title: "Created", body: "Body" });
    expect(log[0]).toBe("before:<new>");
    expect(log[1]).toBe("after:" + p.id);
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
      beforeAdd: () => throwAbort(),
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = await proxy.create({ title: "Blocked", body: "Body" });
    expect(p.isNewRecord()).toBe(true);
    const all = await (Post as any).all().toArray();
    expect(all.length).toBe(0);
  });

  it("has many callbacks halt execution when abort is trown when adding to association", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({ beforeAdd: () => throwAbort() });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "abc", body: "Body", author_id: author.id });
    await proxy.push(p);
    expect((await proxy.toArray()).length).toBe(0);
  });

  it("has many callbacks halt execution when abort is trown when removing from association", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({ beforeRemove: () => throwAbort() });
    const author = await Author.create({ name: "David" });
    const p = await (Post as any).create({ title: "abc", body: "Body", author_id: author.id });
    const proxy = association(author, "posts");
    expect((await proxy.toArray()).length).toBe(1);
    await proxy.delete(p);
    expect((await proxy.toArray()).length).toBe(1);
  });

  it("before_remove abort halts the whole removal, not just the current record", async () => {
    // Rails wraps the entire before_remove loop in one catch(:abort), so an
    // abort on any record leaves ALL records (including earlier ones) in place.
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeRemove: (_owner: any, record: any) => {
        if (record.title === "keep") throwAbort();
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
    expect((await proxy.toArray()).length).toBe(2);
    await proxy.delete(p1, p2);
    // p1 must NOT have been removed even though its own before_remove passed.
    expect((await proxy.toArray()).length).toBe(2);
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

  it("has many callbacks for save on parent", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: (_owner: any, record: any) => {
        log.push("before_adding" + (record.id ?? "<new>"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after_adding" + (record.id ?? "<new>"));
      },
    });
    const author = new (Author as any)({ name: "Jack" });
    const proxy = association(author, "posts");
    proxy.build({ title: "Call me back!", body: "Body" });
    expect(log).toEqual(["before_adding<new>", "after_adding<new>"]);
    expect(await author.save()).toBe(true);
    // Re-query the DB (not the in-memory proxy target) so this asserts the
    // built post was actually persisted — mirrors Rails' `.count`.
    expect((await (Post as any).all().toArray()).length).toBe(1);
    expect(log).toEqual(["before_adding<new>", "after_adding<new>"]);
  });

  it("dont add if before callback raises exception", async () => {
    const log: string[] = [];
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: () => {
        log.push("before");
        throw new Error("nope");
      },
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "blocked", body: "Body", author_id: author.id });
    try {
      await proxy.push(p);
    } catch {
      // swallowed, like Rails' `rescue Exception`
    }
    expect((await proxy.toArray()).length).toBe(0);
  });

  it("after_add callback throwing abort propagates (not swallowed)", async () => {
    // Rails wraps only before_add/before_remove in catch(:abort); after_add
    // runs outside it (collection_association.rb:485), so a thrown abort
    // surfaces to the caller rather than being silently swallowed.
    const { Author, Post } = makeAuthorWithCallbacks({
      afterAdd: () => throwAbort(),
    });
    const author = await Author.create({ name: "David" });
    const proxy = association(author, "posts");
    const p = new (Post as any)({ title: "abc", body: "Body", author_id: author.id });
    await expect(proxy.push(p)).rejects.toBeDefined();
  });
});

// ==========================================================================
// Destroy-on-parent uses the canonical Firm/Client (Company STI) models, whose
// `clients` dependent:destroy has_many carries the before/after_remove logging
// to `firm.log` — mirroring Rails' test_has_many_callbacks_for_destroy_on_parent
// (associations/callbacks_test.rb:105-111).
// ==========================================================================
describe("AssociationCallbacksTest", () => {
  setupFixtures();
  withTransactionalFixtures(() => Base.connection);
  beforeAll(async () => {
    registerModel(Company);
    registerModel(Firm);
    registerModel(Client);
    registerModel(Account);
    enableSti(Company);
    registerSubclass(Firm);
    registerSubclass(Client);
    await defineSchema(Base.connection, {
      companies: canonicalSchema.companies,
      // Firm#account is dependent:destroy, so firm.destroy queries `accounts`.
      accounts: canonicalSchema.accounts,
    });
  });

  it("has many callbacks for destroy on parent", async () => {
    const firm = await Firm.create({ name: "Firm" });
    const client = await firm.clients.create({ name: "Client" });
    await firm.destroy();

    expect(firm.log).toEqual([`before_remove${client.id}`, `after_remove${client.id}`]);
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
  const { projects, developers } = fixtures(["projects", "developers", "developersProjects"], {
    schema: canonicalSchema,
  });
  // The fixture-schema slice only creates the tables the fixtures touch;
  // creating a Developer autosaves an `audit_logs` row (its `before_create`),
  // so that table must exist too.
  beforeAll(async () => {
    await defineSchema(Base.connection, {
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
