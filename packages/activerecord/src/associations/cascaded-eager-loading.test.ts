/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import { Associations } from "../associations.js";

import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

describe("CascadedEagerLoadingTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      en_parents: { name: "string" },
      en_children: { value: "string", en_parent_id: "integer" },
      sti_topics: { title: "string", type: "string", parent_id: "integer" },
      sti_topics2: { title: "string", type: "string", parent_id: "integer" },
      sti_topics3: { title: "string", type: "string", parent_id: "integer" },
      ef_parents: { name: "string" },
      ef_children: { value: "string", ef_parent_id: "integer" },
      pm_authors: { name: "string" },
      pm_posts: { title: "string", pm_author_id: "integer" },
      em_authors: { name: "string" },
      em_posts: { title: "string", em_author_id: "integer" },
      pd_authors: { name: "string" },
      pd_posts: { title: "string", pd_author_id: "integer" },
    });
  });

  it.skip("eager association loading with cascaded two levels", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading with cascaded two levels and one level", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading with hmt does not table name collide when joining associations", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading grafts stashed associations to correct parent", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("cascaded eager association loading with join for count", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("cascaded eager association loading with duplicated includes", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("cascaded eager association loading with twice includes edge cases", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading with join for count", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it("eager association loading with nil associations", async () => {
    class ENParent extends Base {
      static {
        this._tableName = "en_parents";
        this.attribute("name", "string");
      }
    }
    class ENChild extends Base {
      static {
        this._tableName = "en_children";
        this.attribute("value", "string");
        this.attribute("en_parent_id", "integer");
      }
    }
    Associations.hasMany.call(ENParent, "enChildren", {
      foreignKey: "en_parent_id",
      className: "ENChild",
    });
    registerModel("ENParent", ENParent);
    registerModel("ENChild", ENChild);
    await ENParent.create({ name: "lonely" });
    const authors = await ENParent.all().includes("enChildren").toArray();
    expect(authors.length).toBe(1);
    const children = (authors[0] as any)._preloadedAssociations?.get("enChildren") ?? [];
    expect(children.length).toBe(0);
  });
  it.skip("eager association loading with cascaded two levels with two has many associations", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading with cascaded two levels and self table reference", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading with cascaded two levels with condition", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading with cascaded three levels by ping pong", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it("eager association loading with has many sti", async () => {
    class StiTopic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("parent_id", "integer");
        this._tableName = "sti_topics";
        enableSti(StiTopic);
      }
    }
    class StiReply extends StiTopic {
      static {
        registerModel(StiReply);
        registerSubclass(StiReply);
      }
    }
    registerModel(StiTopic);
    Associations.hasMany.call(StiTopic, "replies", {
      className: "StiReply",
      foreignKey: "parent_id",
    });

    const topic1 = await StiTopic.create({ title: "First" });
    const topic2 = await StiTopic.create({ title: "Second" });
    await StiReply.create({ title: "Re: First", parent_id: topic1.id });
    await StiReply.create({ title: "Re: First 2", parent_id: topic1.id });

    const topics = await StiTopic.all().where({ type: null }).includes("replies").toArray();
    expect(topics).toHaveLength(2);
    const t1Replies = (
      topics.find((t: any) => t.title === "First") as any
    )._preloadedAssociations.get("replies");
    expect(t1Replies).toHaveLength(2);
    const t2Replies = (
      topics.find((t: any) => t.title === "Second") as any
    )._preloadedAssociations.get("replies");
    expect(t2Replies).toHaveLength(0);
  });
  it("eager association loading with has many sti and subclasses", async () => {
    class StiTopic2 extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("parent_id", "integer");
        this._tableName = "sti_topics2";
        enableSti(StiTopic2);
      }
    }
    class StiReply2 extends StiTopic2 {
      static {
        registerModel(StiReply2);
        registerSubclass(StiReply2);
      }
    }
    class StiSillyReply2 extends StiReply2 {
      static {
        registerModel(StiSillyReply2);
        registerSubclass(StiSillyReply2);
      }
    }
    registerModel(StiTopic2);
    Associations.hasMany.call(StiTopic2, "replies", {
      className: "StiReply2",
      foreignKey: "parent_id",
    });

    const topic = await StiTopic2.create({ title: "First" });
    await StiReply2.create({ title: "Re: First", parent_id: topic.id });
    await StiSillyReply2.create({ title: "Silly Re: First", parent_id: topic.id });

    const topics = await StiTopic2.all().where({ type: null }).includes("replies").toArray();
    expect(topics).toHaveLength(1);
    const replies = (topics[0] as any)._preloadedAssociations.get("replies");
    expect(replies).toHaveLength(2);
  });
  it("eager association loading with belongs to sti", async () => {
    class StiTopic3 extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("parent_id", "integer");
        this._tableName = "sti_topics3";
        enableSti(StiTopic3);
      }
    }
    class StiReply3 extends StiTopic3 {
      static {
        registerModel(StiReply3);
        registerSubclass(StiReply3);
      }
    }
    registerModel(StiTopic3);
    Associations.belongsTo.call(StiReply3, "topic", {
      className: "StiTopic3",
      foreignKey: "parent_id",
    });

    const topic = await StiTopic3.create({ title: "First" });
    await StiReply3.create({ title: "Re: First", parent_id: topic.id });

    const replies = await StiReply3.all().includes("topic").toArray();
    expect(replies).toHaveLength(1);
    const parentTopic = (replies[0] as any)._preloadedAssociations.get("topic");
    expect(parentTopic).not.toBeNull();
    expect(parentTopic.title).toBe("First");
  });
  it.skip("eager association loading with multiple stis and order", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it("eager association loading where first level returns nil", async () => {
    class EFParent extends Base {
      static {
        this._tableName = "ef_parents";
        this.attribute("name", "string");
      }
    }
    class EFChild extends Base {
      static {
        this._tableName = "ef_children";
        this.attribute("value", "string");
        this.attribute("ef_parent_id", "integer");
      }
    }
    Associations.hasOne.call(EFParent, "efChild", {
      foreignKey: "ef_parent_id",
      className: "EFChild",
    });
    registerModel("EFParent", EFParent);
    registerModel("EFChild", EFChild);
    await EFParent.create({ name: "no-child" });
    const parents = await EFParent.all().includes("efChild").toArray();
    expect(parents.length).toBe(1);
    const child = (parents[0] as any)._preloadedAssociations?.get("efChild");
    expect(child).toBeNull();
  });

  it("preload through missing records", async () => {
    class PMAuthor extends Base {
      static {
        this._tableName = "pm_authors";
        this.attribute("name", "string");
      }
    }
    class PMPost extends Base {
      static {
        this._tableName = "pm_posts";
        this.attribute("title", "string");
        this.attribute("pm_author_id", "integer");
      }
    }
    Associations.belongsTo.call(PMPost, "pmAuthor", {
      foreignKey: "pm_author_id",
      className: "PMAuthor",
    });
    registerModel("PMAuthor", PMAuthor);
    registerModel("PMPost", PMPost);
    await PMPost.create({ title: "orphan", pm_author_id: 9999 });
    const posts = await PMPost.all().includes("pmAuthor").toArray();
    expect(posts.length).toBe(1);
    const author = (posts[0] as any)._preloadedAssociations?.get("pmAuthor");
    expect(author).toBeNull();
  });

  it("eager association loading with missing first record", async () => {
    class EMAuthor extends Base {
      static {
        this._tableName = "em_authors";
        this.attribute("name", "string");
      }
    }
    class EMPost extends Base {
      static {
        this._tableName = "em_posts";
        this.attribute("title", "string");
        this.attribute("em_author_id", "integer");
      }
    }
    Associations.belongsTo.call(EMPost, "emAuthor", {
      foreignKey: "em_author_id",
      className: "EMAuthor",
    });
    registerModel("EMAuthor", EMAuthor);
    registerModel("EMPost", EMPost);
    await EMPost.create({ title: "missing-author", em_author_id: null });
    const a = await EMAuthor.create({ name: "real" });
    await EMPost.create({ title: "has-author", em_author_id: a.id });
    const posts = await EMPost.all().includes("emAuthor").toArray();
    expect(posts.length).toBe(2);
    const authors = posts.map((p: any) => (p as any)._preloadedAssociations?.get("emAuthor"));
    expect(authors.filter((a: any) => a != null).length).toBe(1);
    expect(authors.filter((a: any) => a == null).length).toBe(1);
  });
  it.skip("eager association loading with recursive cascading four levels has many through", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading with recursive cascading four levels has and belongs to many", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("eager association loading with cascaded interdependent one level and two levels", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it("preloaded records are not duplicated", async () => {
    class PDAuthor extends Base {
      static {
        this._tableName = "pd_authors";
        this.attribute("name", "string");
      }
    }
    class PDPost extends Base {
      static {
        this._tableName = "pd_posts";
        this.attribute("title", "string");
        this.attribute("pd_author_id", "integer");
      }
    }
    Associations.hasMany.call(PDAuthor, "pdPosts", {
      foreignKey: "pd_author_id",
      className: "PDPost",
    });
    registerModel("PDAuthor", PDAuthor);
    registerModel("PDPost", PDPost);
    const a = await PDAuthor.create({ name: "Alice" });
    await PDPost.create({ title: "P1", pd_author_id: a.id });
    await PDPost.create({ title: "P2", pd_author_id: a.id });
    const authors = await PDAuthor.all().includes("pdPosts").toArray();
    expect(authors.length).toBe(1);
    const posts = (authors[0] as any)._preloadedAssociations?.get("pdPosts") ?? [];
    expect(posts.length).toBe(2);
    const ids = posts.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.skip("preloading across has one constrains loaded records", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
  it.skip("preloading across has one through constrains loaded records", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/cascaded-eager-loading.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in cascaded-eager-loading.test.ts
    /* fixture-dependent */
  });
});
