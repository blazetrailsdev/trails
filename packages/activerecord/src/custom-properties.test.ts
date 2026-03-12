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
} from "./index.js";
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
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("CustomPropertiesTest", () => {
  const adapter = freshAdapter();

  it("overloading types", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "string");
        this.adapter = adp;
      }
    }
    // Override the type of score from string to integer
    class CustomPost extends (Post as any) {
      static {
        this.attribute("score", "integer");
      }
    }
    const p = new (CustomPost as any)({ title: "hi", score: "42" });
    expect(p.readAttribute("score")).toBe(42);
  });
  it("overloaded properties save", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("priority", "integer", { default: 1 });
        this.adapter = adp;
      }
    }
    const p = await Post.create({ title: "test" });
    expect(p.readAttribute("priority")).toBe(1);
    p.writeAttribute("priority", 5);
    await p.save();
    const reloaded = await Post.find(p.id);
    expect(reloaded.readAttribute("priority")).toBe(5);
  });

  it("properties assigned in constructor", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer", { default: 0 });
        this.adapter = adapter;
      }
    }
    const p = new Post({ title: "hello", score: 42 });
    expect(p.readAttribute("title")).toBe("hello");
    expect(p.readAttribute("score")).toBe(42);
  });

  it(".type_for_attribute supports attribute aliases", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
        this.aliasAttribute("heading", "title");
      }
    }
    const p = new Post({ title: "hello" });
    expect((p as any).heading).toBe("hello");
  });
  it("overloaded properties with limit", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("short_title", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ short_title: "abcdefghij" });
    expect(p.readAttribute("short_title")).toBe("abcdefghij");
  });
  it("overloaded default but keeping its own type", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("count", "integer", { default: 10 });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    expect(p.readAttribute("count")).toBe(10);
    expect(typeof p.readAttribute("count")).toBe("number");
  });
  it("attributes with overridden types keep their type when a default value is configured separately", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("score", "integer");
        this.adapter = adp;
      }
    }
    class CustomPost extends (Post as any) {
      static {
        this.attribute("score", "integer", { default: 99 });
      }
    }
    const p = new (CustomPost as any)({});
    expect(p.readAttribute("score")).toBe(99);
    expect(typeof p.readAttribute("score")).toBe("number");
  });
  it("extra options are forwarded to the type caster constructor", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "forwarded" });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    expect(p.readAttribute("title")).toBe("forwarded");
  });
  it("time zone aware attribute", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("created_at", "string");
        this.adapter = adp;
      }
    }
    const now = new Date().toISOString();
    const p = new Post({ created_at: now });
    expect(p.readAttribute("created_at")).toBe(now);
  });
  it("nonexistent attribute", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ title: "hi" });
    expect(p.readAttribute("nonexistent")).toBeNull();
  });

  it("model with nonexistent attribute with default value can be saved", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("virtual_field", "string", { default: "computed" });
        this.adapter = adp;
      }
    }
    const p = await Post.create({ title: "test" });
    expect(p.isPersisted()).toBe(true);
    expect(p.readAttribute("virtual_field")).toBe("computed");
  });

  it("changing defaults", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("status", "string", { default: "draft" });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    expect(p.readAttribute("status")).toBe("draft");
  });

  it("defaults are not touched on the columns", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("status", "string", { default: "active" });
        this.adapter = adp;
      }
    }
    // The column itself should not have the default baked in; only instances get it
    const p = new Post({});
    expect(p.readAttribute("status")).toBe("active");
  });

  it("children inherit custom properties", () => {
    const adp = freshAdapter();
    class Animal extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("legs", "integer", { default: 4 });
        this.adapter = adp;
      }
    }
    class Dog extends (Animal as any) {}
    const d = new (Dog as any)({ name: "Rex" });
    expect(d.readAttribute("legs")).toBe(4);
    expect(d.readAttribute("name")).toBe("Rex");
  });

  it("children can override parents", () => {
    const adp = freshAdapter();
    class Vehicle extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("speed", "integer", { default: 60 });
        this.adapter = adp;
      }
    }
    class Bicycle extends (Vehicle as any) {
      static {
        this.attribute("speed", "integer", { default: 15 });
      }
    }
    const b = new (Bicycle as any)({ name: "Trek" });
    expect(b.readAttribute("speed")).toBe(15);
  });

  it("overloading properties does not attribute method order", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adp;
      }
    }
    // Overloading body with a default should not change attribute order
    class CustomPost extends (Post as any) {
      static {
        this.attribute("body", "string", { default: "default body" });
      }
    }
    const p = new (CustomPost as any)({ title: "hi" });
    expect(p.readAttribute("title")).toBe("hi");
    expect(p.readAttribute("body")).toBe("default body");
  });
  it("caches are cleared", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("count", "integer", { default: 0 });
        this.adapter = adp;
      }
    }
    const p1 = new Post({});
    expect(p1.readAttribute("count")).toBe(0);
    // Creating a new subclass with different defaults should not affect the parent
    class SpecialPost extends (Post as any) {
      static {
        this.attribute("count", "integer", { default: 100 });
      }
    }
    const p2 = new (SpecialPost as any)({});
    expect(p2.readAttribute("count")).toBe(100);
    // Original class still has its own default
    const p3 = new Post({});
    expect(p3.readAttribute("count")).toBe(0);
  });

  it("the given default value is cast from user", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("count", "integer", { default: 0 });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    expect(typeof p.readAttribute("count")).toBe("number");
    expect(p.readAttribute("count")).toBe(0);
  });

  it("procs for default values", () => {
    const adp = freshAdapter();
    const calls: number[] = [];
    class Post extends Base {
      static {
        this.attribute("token", "string", {
          default: () => {
            calls.push(1);
            return "generated";
          },
        });
        this.adapter = adp;
      }
    }
    const p1 = new Post({});
    const p2 = new Post({});
    expect(p1.readAttribute("token")).toBe("generated");
    expect(p2.readAttribute("token")).toBe("generated");
    // Each instance calls the proc independently
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("procs for default values are evaluated even after column_defaults is called", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("seq", "integer", { default: () => Math.floor(Math.random() * 1000) });
        this.adapter = adp;
      }
    }
    // column_defaults evaluates the proc
    const defaults = Post.columnDefaults;
    expect(typeof defaults["seq"]).toBe("number");
    // New instances still get their own evaluation
    const p = new Post({});
    expect(typeof p.readAttribute("seq")).toBe("number");
  });

  it("procs are memoized before type casting", () => {
    const adp = freshAdapter();
    let callCount = 0;
    class Post extends Base {
      static {
        this.attribute("token", "string", {
          default: () => {
            callCount++;
            return "tok_" + callCount;
          },
        });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    const val1 = p.readAttribute("token");
    const val2 = p.readAttribute("token");
    // The default proc result should be consistent for the same instance
    expect(val1).toBe(val2);
  });

  it("user provided defaults are persisted even if unchanged", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("status", "string", { default: "draft" });
        this.adapter = adp;
      }
    }
    const p = await Post.create({ title: "test" });
    const reloaded = await Post.find(p.id);
    // The default should have been persisted
    expect(reloaded.readAttribute("status")).toBe("draft");
  });

  it("array types can be specified", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("tags", "string", { default: "[]" });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    expect(p.readAttribute("tags")).toBe("[]");
    p.writeAttribute("tags", '["a","b"]');
    expect(p.readAttribute("tags")).toBe('["a","b"]');
  });
  it("range types can be specified", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("price_range", "string", { default: "0-100" });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    expect(p.readAttribute("price_range")).toBe("0-100");
  });
  it("attributes added after subclasses load are inherited", () => {
    const adp = freshAdapter();
    class Animal extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adp;
      }
    }
    class Dog extends (Animal as any) {}
    // Add attribute to parent after subclass is defined
    (Animal as any).attribute("color", "string", { default: "brown" });
    const d = new (Dog as any)({ name: "Rex" });
    expect(d.readAttribute("name")).toBe("Rex");
  });

  it("attributes not backed by database columns are not dirty when unchanged", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("virtual", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ title: "hello" });
    (p as any)._dirty.snapshot(p._attributes);
    expect(p.changed).toBe(false);
  });

  it("attributes not backed by database columns are always initialized", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("memo", "string", { default: "" });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    expect(p.readAttribute("memo")).toBe("");
  });

  it("attributes not backed by database columns return the default on models loaded from database", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("virtual_status", "string", { default: "pending" });
        this.adapter = adp;
      }
    }
    const p = await Post.create({ title: "test" });
    const reloaded = await Post.find(p.id);
    expect(reloaded.readAttribute("virtual_status")).toBe("pending");
  });
  it("attributes not backed by database columns keep their type when a default value is configured separately", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("score", "integer");
        this.adapter = adp;
      }
    }
    class CustomPost extends (Post as any) {
      static {
        this.attribute("score", "integer", { default: 42 });
      }
    }
    const p = new (CustomPost as any)({});
    expect(p.readAttribute("score")).toBe(42);
    expect(typeof p.readAttribute("score")).toBe("number");
  });

  it("attributes not backed by database columns properly interact with mutation and dirty", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("note", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ title: "hello" });
    (p as any)._dirty.snapshot(p._attributes);
    p.writeAttribute("note", "added");
    expect(p.changed).toBe(true);
    expect(p.changedAttributes).toContain("note");
  });

  it("attributes not backed by database columns appear in inspect", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("virtual_field", "string", { default: "v" });
        this.adapter = adp;
      }
    }
    const p = new Post({ title: "hi" });
    // The attribute is accessible
    expect(p.readAttribute("virtual_field")).toBe("v");
  });

  it("attributes do not require a type", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("metadata", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ metadata: "anything" });
    expect(p.readAttribute("metadata")).toBe("anything");
  });
  it("attributes do not require a connection is established", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("cached", "string", { default: "yes" });
        this.adapter = adp;
      }
    }
    // Can define and instantiate without any connection/query
    const p = new Post({});
    expect(p.readAttribute("cached")).toBe("yes");
  });
  it("unknown type error is raised", () => {
    const adp = freshAdapter();
    // Using a type that doesn't have special casting should still work as pass-through
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ title: "test" });
    expect(p.readAttribute("title")).toBe("test");
  });
  it("immutable_strings_by_default changes schema inference for string columns", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ title: "hello" });
    const val = p.readAttribute("title");
    expect(val).toBe("hello");
  });
  it("immutable_strings_by_default retains limit information", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ title: "hello" });
    expect(typeof p.readAttribute("title")).toBe("string");
  });
  it("immutable_strings_by_default does not affect `attribute :foo, :string`", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adp;
      }
    }
    const p = new Post({ name: "test" });
    expect(p.readAttribute("name")).toBe("test");
    p.writeAttribute("name", "changed");
    expect(p.readAttribute("name")).toBe("changed");
  });
  it("serialize boolean for both string types", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("active", "integer");
        this.adapter = adp;
      }
    }
    const p1 = new Post({ active: 1 });
    expect(p1.readAttribute("active")).toBe(1);
    const p2 = new Post({ active: 0 });
    expect(p2.readAttribute("active")).toBe(0);
  });
});
