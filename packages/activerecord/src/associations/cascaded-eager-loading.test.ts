/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "../index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "../associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("CascadedEagerLoadingTest", () => {
  it.skip("eager association loading with cascaded two levels", () => { /* fixture-dependent */ });
  it.skip("eager association loading with cascaded two levels and one level", () => { /* fixture-dependent */ });
  it.skip("eager association loading with hmt does not table name collide when joining associations", () => { /* fixture-dependent */ });
  it.skip("eager association loading grafts stashed associations to correct parent", () => { /* fixture-dependent */ });
  it.skip("cascaded eager association loading with join for count", () => { /* fixture-dependent */ });
  it.skip("cascaded eager association loading with duplicated includes", () => { /* fixture-dependent */ });
  it.skip("cascaded eager association loading with twice includes edge cases", () => { /* fixture-dependent */ });
  it.skip("eager association loading with join for count", () => { /* fixture-dependent */ });
  it("eager association loading with nil associations", async () => {
    const adapter = freshAdapter();
    class ENParent extends Base {
      static { this._tableName = "en_parents"; this.attribute("name", "string"); this.adapter = adapter; }
    }
    class ENChild extends Base {
      static { this._tableName = "en_children"; this.attribute("value", "string"); this.attribute("en_parent_id", "integer"); this.adapter = adapter; }
    }
    Associations.hasMany.call(ENParent, "enChildren", { foreignKey: "en_parent_id", className: "ENChild" });
    registerModel("ENParent", ENParent);
    registerModel("ENChild", ENChild);
    // Parent with no children
    await ENParent.create({ name: "lonely" });
    const parents = await ENParent.all().includes("enChildren").toArray();
    expect(parents.length).toBe(1);
    const children = (parents[0] as any)._preloadedAssociations?.get("enChildren") ?? [];
    expect(children.length).toBe(0);
  });
  it.skip("eager association loading with cascaded two levels with two has many associations", () => { /* fixture-dependent */ });
  it.skip("eager association loading with cascaded two levels and self table reference", () => { /* fixture-dependent */ });
  it.skip("eager association loading with cascaded two levels with condition", () => { /* fixture-dependent */ });
  it.skip("eager association loading with cascaded three levels by ping pong", () => { /* fixture-dependent */ });
  it("eager association loading with has many sti", async () => {
    const adapter = freshAdapter();
    class StiTopic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("parent_id", "integer");
        this._tableName = "sti_topics";
        this.adapter = adapter;
        enableSti(StiTopic);
      }
    }
    class StiReply extends StiTopic {
      static { this.adapter = adapter; registerModel(StiReply); registerSubclass(StiReply); }
    }
    registerModel(StiTopic);
    (StiTopic as any)._associations = [
      { type: "hasMany", name: "replies", options: { className: "StiReply", foreignKey: "parent_id" } },
    ];

    const topic1 = await StiTopic.create({ title: "First" });
    const topic2 = await StiTopic.create({ title: "Second" });
    await StiReply.create({ title: "Re: First", parent_id: topic1.id });
    await StiReply.create({ title: "Re: First 2", parent_id: topic1.id });

    const topics = await StiTopic.all().where({ type: null }).includes("replies").toArray();
    expect(topics).toHaveLength(2);
    const t1Replies = (topics.find((t: any) => t.readAttribute("title") === "First") as any)._preloadedAssociations.get("replies");
    expect(t1Replies).toHaveLength(2);
    const t2Replies = (topics.find((t: any) => t.readAttribute("title") === "Second") as any)._preloadedAssociations.get("replies");
    expect(t2Replies).toHaveLength(0);
  });
  it("eager association loading with has many sti and subclasses", async () => {
    const adapter = freshAdapter();
    class StiTopic2 extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("parent_id", "integer");
        this._tableName = "sti_topics2";
        this.adapter = adapter;
        enableSti(StiTopic2);
      }
    }
    class StiReply2 extends StiTopic2 {
      static { this.adapter = adapter; registerModel(StiReply2); registerSubclass(StiReply2); }
    }
    class StiSillyReply2 extends StiReply2 {
      static { this.adapter = adapter; registerModel(StiSillyReply2); registerSubclass(StiSillyReply2); }
    }
    registerModel(StiTopic2);
    (StiTopic2 as any)._associations = [
      { type: "hasMany", name: "replies", options: { className: "StiReply2", foreignKey: "parent_id" } },
    ];

    const topic = await StiTopic2.create({ title: "First" });
    await StiReply2.create({ title: "Re: First", parent_id: topic.id });
    await StiSillyReply2.create({ title: "Silly Re: First", parent_id: topic.id });

    const topics = await StiTopic2.all().where({ type: null }).includes("replies").toArray();
    expect(topics).toHaveLength(1);
    const replies = (topics[0] as any)._preloadedAssociations.get("replies");
    // Should include both StiReply2 and StiSillyReply2
    expect(replies).toHaveLength(2);
  });
  it("eager association loading with belongs to sti", async () => {
    const adapter = freshAdapter();
    class StiTopic3 extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("parent_id", "integer");
        this._tableName = "sti_topics3";
        this.adapter = adapter;
        enableSti(StiTopic3);
      }
    }
    class StiReply3 extends StiTopic3 {
      static { this.adapter = adapter; registerModel(StiReply3); registerSubclass(StiReply3); }
    }
    registerModel(StiTopic3);
    (StiReply3 as any)._associations = [
      { type: "belongsTo", name: "topic", options: { className: "StiTopic3", foreignKey: "parent_id" } },
    ];

    const topic = await StiTopic3.create({ title: "First" });
    await StiReply3.create({ title: "Re: First", parent_id: topic.id });

    const replies = await StiReply3.all().includes("topic").toArray();
    expect(replies).toHaveLength(1);
    const parentTopic = (replies[0] as any)._preloadedAssociations.get("topic");
    expect(parentTopic).not.toBeNull();
    expect(parentTopic.readAttribute("title")).toBe("First");
  });
  it.skip("eager association loading with multiple stis and order", () => { /* fixture-dependent */ });
  it.skip("eager association loading of stis with multiple references", () => { /* fixture-dependent */ });
  it("eager association loading where first level returns nil", async () => {
    const adapter = freshAdapter();
    class EFParent extends Base {
      static { this._tableName = "ef_parents"; this.attribute("name", "string"); this.adapter = adapter; }
    }
    class EFChild extends Base {
      static { this._tableName = "ef_children"; this.attribute("value", "string"); this.attribute("ef_parent_id", "integer"); this.adapter = adapter; }
    }
    Associations.hasOne.call(EFParent, "efChild", { foreignKey: "ef_parent_id", className: "EFChild" });
    registerModel("EFParent", EFParent);
    registerModel("EFChild", EFChild);
    await EFParent.create({ name: "no-child" });
    const parents = await EFParent.all().includes("efChild").toArray();
    expect(parents.length).toBe(1);
    const child = (parents[0] as any)._preloadedAssociations?.get("efChild");
    expect(child).toBeNull();
  });

  it("preload through missing records", async () => {
    const adapter = freshAdapter();
    class PMAuthor extends Base {
      static { this._tableName = "pm_authors"; this.attribute("name", "string"); this.adapter = adapter; }
    }
    class PMPost extends Base {
      static { this._tableName = "pm_posts"; this.attribute("title", "string"); this.attribute("pm_author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(PMPost, "pmAuthor", { foreignKey: "pm_author_id", className: "PMAuthor" });
    registerModel("PMAuthor", PMAuthor);
    registerModel("PMPost", PMPost);
    // Post with non-existent author id
    await PMPost.create({ title: "orphan", pm_author_id: 9999 });
    const posts = await PMPost.all().includes("pmAuthor").toArray();
    expect(posts.length).toBe(1);
    const author = (posts[0] as any)._preloadedAssociations?.get("pmAuthor");
    expect(author).toBeNull();
  });

  it("eager association loading with missing first record", async () => {
    const adapter = freshAdapter();
    class EMAuthor extends Base {
      static { this._tableName = "em_authors"; this.attribute("name", "string"); this.adapter = adapter; }
    }
    class EMPost extends Base {
      static { this._tableName = "em_posts"; this.attribute("title", "string"); this.attribute("em_author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(EMPost, "emAuthor", { foreignKey: "em_author_id", className: "EMAuthor" });
    registerModel("EMAuthor", EMAuthor);
    registerModel("EMPost", EMPost);
    await EMPost.create({ title: "missing-author", em_author_id: null });
    const a = await EMAuthor.create({ name: "real" });
    await EMPost.create({ title: "has-author", em_author_id: a.id });
    const posts = await EMPost.all().includes("emAuthor").toArray();
    expect(posts.length).toBe(2);
    // One should have author, one should not
    const authors = posts.map((p: any) => (p as any)._preloadedAssociations?.get("emAuthor"));
    expect(authors.filter((a: any) => a != null).length).toBe(1);
    expect(authors.filter((a: any) => a == null).length).toBe(1);
  });
  it.skip("eager association loading with recursive cascading four levels has many through", () => { /* fixture-dependent */ });
  it.skip("eager association loading with recursive cascading four levels has and belongs to many", () => { /* fixture-dependent */ });
  it.skip("eager association loading with cascaded interdependent one level and two levels", () => { /* fixture-dependent */ });
  it("preloaded records are not duplicated", async () => {
    const adapter = freshAdapter();
    class PDAuthor extends Base {
      static { this._tableName = "pd_authors"; this.attribute("name", "string"); this.adapter = adapter; }
    }
    class PDPost extends Base {
      static { this._tableName = "pd_posts"; this.attribute("title", "string"); this.attribute("pd_author_id", "integer"); this.adapter = adapter; }
    }
    Associations.hasMany.call(PDAuthor, "pdPosts", { foreignKey: "pd_author_id", className: "PDPost" });
    registerModel("PDAuthor", PDAuthor);
    registerModel("PDPost", PDPost);
    const a = await PDAuthor.create({ name: "Alice" });
    await PDPost.create({ title: "P1", pd_author_id: a.id });
    await PDPost.create({ title: "P2", pd_author_id: a.id });
    const authors = await PDAuthor.all().includes("pdPosts").toArray();
    expect(authors.length).toBe(1);
    const posts = (authors[0] as any)._preloadedAssociations?.get("pdPosts") ?? [];
    expect(posts.length).toBe(2);
    // Check no duplicates - all unique ids
    const ids = posts.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.skip("preloading across has one constrains loaded records", () => { /* fixture-dependent */ });
  it.skip("preloading across has one through constrains loaded records", () => { /* fixture-dependent */ });
});
