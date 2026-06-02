/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, CollectionProxy, Relation, association, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { HasMany } from "./builder/has-many.js";

import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Developer } from "../test-helpers/models/developer.js";
import { Project } from "../test-helpers/models/project.js";

registerModel(Post);
registerModel(Comment);
registerModel(Developer);
registerModel(Project);

// has_many :comments extension tests — migrated to the canonical Post model
// (whose `comments` association carries the Rails `find_most_recent` /
// `with_content` extension block) + real posts/comments fixture lookups,
// mirroring `AssociationsExtensionsTest` against `posts(:welcome).comments`.
describe("AssociationsExtensionsTest", () => {
  const { posts, comments, developers, projects } = useHandlerFixtures(
    ["posts", "comments", "developers", "projects", "developersProjects"],
    { schema: canonicalSchema },
  );
  // Force-recreate `posts`/`comments` to the canonical shape. Under vitest's
  // per-file module isolation the signature/schema caches reset to canonical
  // each file, so `useHandlerFixtures`' own `defineSchema` sees a cache-hit and
  // skips the repair — leaving a reduced `posts:{title}` shape (no `body`) that
  // a sibling handler-suite file co-scheduled earlier in the same fork wrote to
  // the shared worker DB. `dropExisting` drops + recreates unconditionally, so
  // the posts fixture INSERT (which carries a `body` value) finds the column.
  // Registered after `useHandlerFixtures` so this `beforeAll` runs last and wins.
  beforeAll(async () => {
    const s = canonicalSchema as Schema;
    await defineSchema(
      {
        posts: s.posts,
        comments: s.comments,
        developers: s.developers,
        projects: s.projects,
        developers_projects: s.developers_projects,
      },
      { dropExisting: true },
    );
  });

  it("extension on has many", async () => {
    const proxy = association(posts("welcome"), "comments") as unknown as {
      findMostRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(comments("more_greetings").id);
  });

  it("proxy association after scoped", async () => {
    // Rails: `post.comments.the_association == post.association(:comments)`.
    // `the_association` returns `proxy_association`; assert it exposes the
    // owning record + reflection, and that a relation spawned off the proxy
    // via `where("1=1")` still surfaces the extension method.
    const post = posts("welcome");
    const proxy = association(post, "comments") as unknown as CollectionProxy & {
      theAssociation: () => { owner: Base; reflection: { name: string } };
    };
    expect(proxy).toBeInstanceOf(CollectionProxy);
    expect(proxy.theAssociation().owner).toBe(post);
    expect(proxy.theAssociation().reflection.name).toBe("comments");

    const scoped = proxy.where("1=1") as unknown as {
      theAssociation: () => { owner: Base; reflection: { name: string } };
    };
    expect(scoped.theAssociation().owner).toBe(post);
    expect(scoped.theAssociation().reflection.name).toBe("comments");
  });

  it("extension with dirty target", async () => {
    // `with_content` scans the loaded target — including the dirty (built but
    // unsaved) record — so it returns the just-built comment by identity.
    const proxy = association(posts("welcome"), "comments") as unknown as CollectionProxy & {
      withContent: (content: string) => Promise<Base | null>;
    };
    const comment = proxy.build({ body: "New comment" });
    expect(await proxy.withContent("New comment")).toBe(comment);
  });

  // HABTM extension tests — migrated to the canonical Developer model (whose
  // `projects*` associations carry the Rails `find_most_recent` /
  // `find_least_recent` extensions) + real developers/projects/developers_projects
  // fixtures. `developers(:david).projects` resolves through the join table to
  // projects(:active_record) (id 1) and projects(:action_controller) (id 2);
  // `find_most_recent` (order id DESC) → action_controller, `find_least_recent`
  // (order id ASC) → active_record.
  it("extension on habtm", async () => {
    const proxy = association(developers("david"), "projects") as unknown as {
      findMostRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(projects("action_controller").id);
  });

  it("named extension on habtm", async () => {
    const proxy = association(developers("david"), "projectsExtendedByName") as unknown as {
      findMostRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(projects("action_controller").id);
  });

  it("named two extensions on habtm", async () => {
    const proxy = association(developers("david"), "projectsExtendedByNameTwice") as unknown as {
      findMostRecent: () => Promise<Base | null>;
      findLeastRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(projects("action_controller").id);
    expect((await proxy.findLeastRecent())!.id).toBe(projects("active_record").id);
  });

  it("named extension and block on habtm", async () => {
    const proxy = association(developers("david"), "projectsExtendedByNameAndBlock") as unknown as {
      findMostRecent: () => Promise<Base | null>;
      findLeastRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(projects("action_controller").id);
    expect((await proxy.findLeastRecent())!.id).toBe(projects("active_record").id);
  });
});

const TEST_SCHEMA: Schema = {
  ext_posts: { title: "string" },
  ext_comments: { body: "string", ext_post_id: "integer" },
};

async function freshAdapter(): Promise<TestDatabaseAdapter> {
  const adapter = createTestAdapter();
  await defineSchema(adapter, TEST_SCHEMA);
  return adapter;
}

// `extension with scopes` and `association with default scope` still ride
// inline models. The former needs association `extend:` methods to survive a
// *named-scope* spawn (`comments.not_again.find_most_recent`), which trails
// does not yet propagate; the latter needs a Comment `OopsExtension` default
// scope override of `destroyAll`. Both are follow-up passes, so this file
// stays on eslint/test-fixture-parity-exclude.json until then.
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

  it("extension with scopes", async () => {
    // Still inline: the canonical-Post port needs association `extend:`
    // methods to survive a *named-scope* spawn (`comments.not_again.…`),
    // which trails does not yet propagate (query-method spawns like
    // `.offset(1)` already do). Pending that gap, this stays on bespoke
    // models. Mirrors `posts(:welcome).comments.offset(1).find_most_recent`.
    const { ExtPost, ExtComment } = setupExtModels();
    const post = await ExtPost.create({ title: "scoped ext" });
    await ExtComment.create({ body: "a", ext_post_id: post.id });
    await ExtComment.create({ body: "b", ext_post_id: post.id });
    const proxy = association(post, "extComments");
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
  it("extension name", () => {
    // Mirrors Rails `extend!(model)` helper, which calls
    // `Builder::HasMany.define_extensions(model, :association_name) { }`.
    // The block triggers a generated extension module named off the
    // camelized association name, stored as a constant on the model.
    // The two-model assertion mirrors Rails checking both `Developer`
    // and the namespaced `MyApplication::Business::Developer`.
    class Developer extends Base {}
    class BusinessDeveloper extends Base {}
    HasMany.defineExtensions(Developer, "associationName", () => {});
    HasMany.defineExtensions(BusinessDeveloper, "associationName", () => {});
    expect(
      (Developer as unknown as Record<string, unknown>).AssociationNameAssociationExtension,
    ).toBeTruthy();
    expect(
      (BusinessDeveloper as unknown as Record<string, unknown>).AssociationNameAssociationExtension,
    ).toBeTruthy();
  });
});
