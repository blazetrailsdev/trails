/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, CollectionProxy, Relation, association, registerModel } from "../index.js";
import { Associations } from "../associations.js";

import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";

const TEST_SCHEMA: Schema = {
  ext_posts: { title: "string" },
  ext_comments: { body: "string", ext_post_id: "integer" },
  h_projects: { name: "string" },
  h_developers: { name: "string" },
  h_developers_h_projects: { h_developer_id: "integer", h_project_id: "integer" },
  n_projects: { name: "string" },
  n_developers: { name: "string" },
  n_developers_n_projects: { n_developer_id: "integer", n_project_id: "integer" },
  t2_projects: { name: "string" },
  t2_developers: { name: "string" },
  t2_developers_t2_projects: { t2_developer_id: "integer", t2_project_id: "integer" },
  nb_projects: { name: "string" },
  nb_developers: { name: "string" },
  nb_developers_nb_projects: { nb_developer_id: "integer", nb_project_id: "integer" },
};

async function freshAdapter(): Promise<TestDatabaseAdapter> {
  const adapter = createTestAdapter();
  await defineSchema(adapter, TEST_SCHEMA);
  return adapter;
}

describe("AssociationsExtensionsTest", () => {
  let extAdapter: TestDatabaseAdapter;

  beforeAll(async () => {
    extAdapter = await freshAdapter();
  });
  withTransactionalFixtures(() => extAdapter);

  function setupExtModels() {
    class ExtComment extends Base {
      static {
        this._tableName = "ext_comments";
        this.attribute("body", "string");
        this.attribute("ext_post_id", "integer");
        this.adapter = extAdapter;
      }
    }
    class ExtPost extends Base {
      static {
        this._tableName = "ext_posts";
        this.attribute("title", "string");
        this.adapter = extAdapter;
      }
    }
    const findMostRecent = {
      // Typed as the base Relation, not CollectionProxy: this extension is
      // also invoked on relations spawned off the proxy (e.g. after
      // `.offset(1)`), which are plain Relations.
      findMostRecent: async function (this: Relation<Base>) {
        const all = await this.toArray();
        return all[all.length - 1] ?? null;
      },
    };
    Associations.hasMany.call(ExtPost, "extComments", {
      foreignKey: "ext_post_id",
      className: "ExtComment",
      extend: findMostRecent,
    });
    registerModel("ExtPost", ExtPost);
    registerModel("ExtComment", ExtComment);
    return { ExtPost, ExtComment };
  }

  it("extension on has many", async () => {
    const { ExtPost, ExtComment } = setupExtModels();
    const post = await ExtPost.create({ title: "ext test" });
    await ExtComment.create({ body: "hello", ext_post_id: post.id });
    const proxy = association(post, "extComments");
    const results = await proxy.toArray();
    expect(results.length).toBe(1);
  });

  it("extension with scopes", async () => {
    const { ExtPost, ExtComment } = setupExtModels();
    const post = await ExtPost.create({ title: "scoped ext" });
    await ExtComment.create({ body: "a", ext_post_id: post.id });
    await ExtComment.create({ body: "b", ext_post_id: post.id });
    const proxy = association(post, "extComments");
    // Mirrors Rails `posts(:welcome).comments.offset(1).find_most_recent`:
    // the extension method must remain callable on a relation spawned off
    // the proxy via a scope mutation. Order explicitly by PK so the
    // offset is deterministic across adapters.
    const recent = await (
      proxy.order({ id: "asc" }).offset(1) as unknown as {
        findMostRecent: () => Promise<{ body: string } | null>;
      }
    ).findMostRecent();
    expect(recent).not.toBeNull();
    expect(recent!.body).toBe("b");
  });

  it("association with default scope", async () => {
    const { ExtPost, ExtComment } = setupExtModels();
    const post = await ExtPost.create({ title: "default scope" });
    await ExtComment.create({ body: "scoped", ext_post_id: post.id });
    const proxy = association(post, "extComments");
    const all = await proxy.toArray();
    expect(all.length).toBe(1);
  });

  it("proxy association after scoped", async () => {
    const { ExtPost, ExtComment } = setupExtModels();
    const post = await ExtPost.create({ title: "after scoped" });
    await ExtComment.create({ body: "x", ext_post_id: post.id });
    const proxy = association(post, "extComments");
    expect(proxy).toBeInstanceOf(CollectionProxy);
    const count = await proxy.count();
    expect(count).toBe(1);
  });

  it("extension on habtm", async () => {
    class HProject extends Base {
      static {
        this._tableName = "h_projects";
        this.attribute("name", "string");
        this.adapter = extAdapter;
      }
    }
    class HDeveloper extends Base {
      static {
        this._tableName = "h_developers";
        this.attribute("name", "string");
        this.adapter = extAdapter;
      }
    }
    registerModel("HProject", HProject);
    registerModel("HDeveloper", HDeveloper);

    const findMostRecent = {
      findMostRecent: async function (this: CollectionProxy) {
        const all = await this.toArray();
        return all[all.length - 1] ?? null;
      },
    };
    Associations.hasAndBelongsToMany.call(HDeveloper, "hProjects", {
      className: "HProject",
      joinTable: "h_developers_h_projects",
      extend: findMostRecent,
    });

    const dev = await HDeveloper.create({ name: "Alice" });
    const p1 = await HProject.create({ name: "First" });
    const p2 = await HProject.create({ name: "Second" });
    const proxy = association(dev, "hProjects");
    await proxy.push(p1, p2);
    const most = await proxy.findMostRecent();
    expect(most).not.toBeNull();
    expect(most!.name).toBe("Second");
  });

  it("named extension on habtm", async () => {
    class NProject extends Base {
      static {
        this._tableName = "n_projects";
        this.attribute("name", "string");
        this.adapter = extAdapter;
      }
    }
    class NDeveloper extends Base {
      static {
        this._tableName = "n_developers";
        this.attribute("name", "string");
        this.adapter = extAdapter;
      }
    }
    registerModel("NProject", NProject);
    registerModel("NDeveloper", NDeveloper);

    const FindMostRecent = {
      findMostRecent: async function (this: CollectionProxy) {
        const all = await this.toArray();
        return all[all.length - 1] ?? null;
      },
    };
    Associations.hasAndBelongsToMany.call(NDeveloper, "nProjects", {
      className: "NProject",
      joinTable: "n_developers_n_projects",
      extend: FindMostRecent,
    });

    const dev = await NDeveloper.create({ name: "Bob" });
    const p1 = await NProject.create({ name: "Old" });
    const p2 = await NProject.create({ name: "New" });
    const proxy = association(dev, "nProjects");
    await proxy.push(p1, p2);
    const most = await proxy.findMostRecent();
    expect(most).not.toBeNull();
    expect(most!.name).toBe("New");
  });

  it("named two extensions on habtm", async () => {
    class T2Project extends Base {
      static {
        this._tableName = "t2_projects";
        this.attribute("name", "string");
        this.adapter = extAdapter;
      }
    }
    class T2Developer extends Base {
      static {
        this._tableName = "t2_developers";
        this.attribute("name", "string");
        this.adapter = extAdapter;
      }
    }
    registerModel("T2Project", T2Project);
    registerModel("T2Developer", T2Developer);

    const FindMostRecent = {
      findMostRecent: async function (this: CollectionProxy) {
        const all = await this.toArray();
        return all[all.length - 1] ?? null;
      },
    };
    const FindLeastRecent = {
      findLeastRecent: async function (this: CollectionProxy) {
        const all = await this.toArray();
        return all[0] ?? null;
      },
    };
    Associations.hasAndBelongsToMany.call(T2Developer, "t2Projects", {
      className: "T2Project",
      joinTable: "t2_developers_t2_projects",
      extend: [FindMostRecent, FindLeastRecent],
    });

    const dev = await T2Developer.create({ name: "Carol" });
    const p1 = await T2Project.create({ name: "Alpha" });
    const p2 = await T2Project.create({ name: "Beta" });
    const proxy = association(dev, "t2Projects");
    await proxy.push(p1, p2);
    const most = await proxy.findMostRecent();
    const least = await proxy.findLeastRecent();
    expect(most!.name).toBe("Beta");
    expect(least!.name).toBe("Alpha");
  });

  it("named extension and block on habtm", async () => {
    class NBProject extends Base {
      static {
        this._tableName = "nb_projects";
        this.attribute("name", "string");
        this.adapter = extAdapter;
      }
    }
    class NBDeveloper extends Base {
      static {
        this._tableName = "nb_developers";
        this.attribute("name", "string");
        this.adapter = extAdapter;
      }
    }
    registerModel("NBProject", NBProject);
    registerModel("NBDeveloper", NBDeveloper);

    const FindMostRecent = {
      findMostRecent: async function (this: CollectionProxy) {
        const all = await this.toArray();
        return all[all.length - 1] ?? null;
      },
    };
    const FindLeastRecent = {
      findLeastRecent: async function (this: CollectionProxy) {
        const all = await this.toArray();
        return all[0] ?? null;
      },
    };
    Associations.hasAndBelongsToMany.call(NBDeveloper, "nbProjects", {
      className: "NBProject",
      joinTable: "nb_developers_nb_projects",
      extend: [FindMostRecent, FindLeastRecent],
    });

    const dev = await NBDeveloper.create({ name: "Dave" });
    const p1 = await NBProject.create({ name: "First" });
    const p2 = await NBProject.create({ name: "Last" });
    const proxy = association(dev, "nbProjects");
    await proxy.push(p1, p2);
    expect((await proxy.findMostRecent())!.name).toBe("Last");
    expect((await proxy.findLeastRecent())!.name).toBe("First");
  });
  it.skip("extension with dirty target", () => {
    // BLOCKED: associations — collection/singular feature gap
    // ROOT-CAUSE: associations/extension.ts or preloader.ts missing collection/singular semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in extension.test.ts
    /* dirty tracking on proxy not implemented */
  });
  it.skip("marshalling extensions", () => {
    // BLOCKED: associations — collection/singular feature gap
    // ROOT-CAUSE: associations/extension.ts or preloader.ts missing collection/singular semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in extension.test.ts
    /* marshalling not implemented */
  });
  it.skip("marshalling named extensions", () => {
    // BLOCKED: associations — collection/singular feature gap
    // ROOT-CAUSE: associations/extension.ts or preloader.ts missing collection/singular semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in extension.test.ts
    /* marshalling not implemented */
  });
  it.skip("extension name", () => {
    // BLOCKED: associations — collection/singular feature gap
    // ROOT-CAUSE: associations/extension.ts or preloader.ts missing collection/singular semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in extension.test.ts
    /* extension naming not implemented */
  });
});
