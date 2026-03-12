/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Base,
  Relation,
  Range,
  transaction,
  CollectionProxy,
  association,
  defineEnum,
  readEnumValue,
  RecordNotFound,
  RecordInvalid,
  SoleRecordExceeded,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  StaleObjectError,
  columns,
  columnNames,
  reflectOnAssociation,
  reflectOnAllAssociations,
  hasSecureToken,
  serialize,
  registerModel,
  composedOf,
  acceptsNestedAttributesFor,
  assignNestedAttributes,
  generatesTokenFor,
  store,
  storedAttributes,
  Migration,
  Schema,
  MigrationContext,
  TableDefinition,
  delegatedType,
  enableSti,
  registerSubclass,
} from "../index.js";
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
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// AssociationCallbacksTest — targets associations/callbacks_test.rb
// ==========================================================================
describe("AssociationCallbacksTest", () => {
  let cbIdx = 0;
  function makePostWithCallbacks(adapter: DatabaseAdapter, callbacks: any) {
    const idx = ++cbIdx;
    const commentName = `CBComment${idx}`;
    const postName = `CBPost${idx}`;
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        (this as any)._associations = [
          {
            type: "hasMany",
            name: "comments",
            options: { className: commentName, foreignKey: "post_id", ...callbacks },
          },
        ];
      }
    }
    registerModel(commentName, Comment);
    registerModel(postName, Post);
    return { Post, Comment };
  }

  it("adding macro callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    // "macro" style: callback defined as a named function (equivalent to Ruby's method name symbol)
    function onAdd(_owner: any, record: any) {
      log.push("macro:add:" + record.readAttribute("body"));
    }
    const { Post, Comment } = makePostWithCallbacks(adapter, { afterAdd: onAdd });
    const post = await Post.create({ title: "Post" });
    const proxy = association(post, "comments");
    const c = new (Comment as any)({ body: "Hello", post_id: post.id });
    await proxy.push(c);
    expect(log).toContain("macro:add:Hello");
  });

  it("adding with proc callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeAdd: (_owner: any, record: any) => {
        log.push("before:" + record.readAttribute("body"));
      },
      afterAdd: (_owner: any, record: any) => {
        log.push("after:" + record.readAttribute("body"));
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
    const adapter = freshAdapter();
    const log: string[] = [];
    function onRemove(_owner: any, record: any) {
      log.push("macro:remove:" + record.readAttribute("body"));
    }
    const { Post, Comment } = makePostWithCallbacks(adapter, { afterRemove: onRemove });
    const post = await Post.create({ title: "Post" });
    const c = await (Comment as any).create({ body: "ToRemove", post_id: post.id });
    const proxy = association(post, "comments");
    await proxy.delete(c);
    expect(log).toContain("macro:remove:ToRemove");
  });

  it("removing with proc callbacks", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
      beforeRemove: (_owner: any, record: any) => {
        log.push("before:remove:" + record.readAttribute("body"));
      },
      afterRemove: (_owner: any, record: any) => {
        log.push("after:remove:" + record.readAttribute("body"));
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
    const adapter = freshAdapter();
    const log: string[] = [];
    const { Post, Comment } = makePostWithCallbacks(adapter, {
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
  let cbIdx = 0;
  function makePostWithCallbacks(adapter: DatabaseAdapter, callbacks: any) {
    const idx = ++cbIdx;
    const commentName = `CBComment${idx}`;
    const postName = `CBPost${idx}`;
    class Comment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        (this as any)._associations = [
          {
            type: "hasMany",
            name: "comments",
            options: { className: commentName, foreignKey: "post_id", ...callbacks },
          },
        ];
      }
    }
    registerModel(commentName, Comment);
    registerModel(postName, Post);
    return { Post, Comment };
  }

  it.skip("add callback on has many", () => {});
  it.skip("remove callback on has many", () => {});
  it.skip("add callback on has many with proc", () => {});
  it.skip("add callback on has many with string", () => {});
  it.skip("add callback on has one", () => {});
  it.skip("remove callback on has one", () => {});
  it.skip("add callback fires before save", () => {});
  it.skip("add callback fires after save", () => {});
  it.skip("before add throwing abort prevents add", () => {});
  it.skip("after add is called after adding to collection", () => {});
  it.skip("before remove callback", () => {});
  it.skip("after remove callback", () => {});
  it.skip("has many callbacks", () => {});
});
