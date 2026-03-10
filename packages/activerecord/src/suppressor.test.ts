/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "./index.js";
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
} from "./associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("SuppressorTest", () => {
  it("suppresses create", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    await Post.suppress(async () => {
      await Post.create({ title: "suppressed" });
    });
    expect(await Post.count()).toBe(0);
  });

  it("suppresses update", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const post = await Post.create({ title: "original" });
    await Post.suppress(async () => {
      post.writeAttribute("title", "changed");
      await post.save();
    });
    const found = await Post.find(post.id);
    expect(found.readAttribute("title")).toBe("original");
  });

  it("suppresses create in callback", async () => {
    const adapter = freshAdapter();
    class Comment extends Base {
      static { this.attribute("body", "string"); this.adapter = adapter; }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        this.afterCreate(async function(this: any) {
          await Comment.suppress(async () => {
            await Comment.create({ body: "auto-comment" });
          });
        });
      }
    }
    await Post.create({ title: "hello" });
    expect(await Comment.count()).toBe(0);
  });

  it("resumes saving after suppression complete", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    await Post.suppress(async () => {
      await Post.create({ title: "suppressed" });
    });
    await Post.create({ title: "not suppressed" });
    expect(await Post.count()).toBe(1);
  });

  it("suppresses validations on create", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        this.validates("title", { presence: true });
      }
    }
    await Post.suppress(async () => {
      // Even with invalid data, suppress should not persist
      await Post.create({ title: "" });
    });
    expect(await Post.count()).toBe(0);
  });

  it("suppresses when nested multiple times", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    await Post.suppress(async () => {
      await Post.suppress(async () => {
        await Post.create({ title: "nested" });
      });
    });
    expect(await Post.count()).toBe(0);
  });
});


describe("suppress()", () => {
  it("prevents records from being persisted to database", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.suppress(async () => {
      const user = await User.create({ name: "Ghost" });
      // Record appears saved locally
      expect(user.isNewRecord()).toBe(false);
    });

    // But nothing in the database
    const all = await User.all().toArray();
    expect(all.length).toBe(0);
  });
});
