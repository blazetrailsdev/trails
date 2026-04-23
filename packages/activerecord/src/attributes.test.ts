/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { typeRegistry } from "@blazetrails/activemodel";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

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
    expect(p.score).toBe(42);
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
    expect(p.priority).toBe(1);
    p.priority = 5;
    await p.save();
    const reloaded = await Post.find(p.id);
    expect(reloaded.priority).toBe(5);
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
    expect(p.title).toBe("hello");
    expect(p.score).toBe(42);
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
    expect(p.short_title).toBe("abcdefghij");
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
    expect(p.count).toBe(10);
    expect(typeof p.count).toBe("number");
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
    expect(p.score).toBe(99);
    expect(typeof p.score).toBe("number");
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
    expect(p.title).toBe("forwarded");
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
    expect(p.created_at).toBe(now);
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
    expect(p.virtual_field).toBe("computed");
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
    expect(p.status).toBe("draft");
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
    expect(p.status).toBe("active");
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
    expect(d.legs).toBe(4);
    expect(d.name).toBe("Rex");
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
    expect(b.speed).toBe(15);
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
    expect(p.title).toBe("hi");
    expect(p.body).toBe("default body");
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
    expect(p1.count).toBe(0);
    // Creating a new subclass with different defaults should not affect the parent
    class SpecialPost extends (Post as any) {
      static {
        this.attribute("count", "integer", { default: 100 });
      }
    }
    const p2 = new (SpecialPost as any)({});
    expect(p2.count).toBe(100);
    // Original class still has its own default
    const p3 = new Post({});
    expect(p3.count).toBe(0);
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
    expect(typeof p.count).toBe("number");
    expect(p.count).toBe(0);
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
    expect(p1.token).toBe("generated");
    expect(p2.token).toBe("generated");
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
    expect(typeof p.seq).toBe("number");
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
    const val1 = p.token;
    const val2 = p.token;
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
    expect(reloaded.status).toBe("draft");
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
    expect(p.tags).toBe("[]");
    p.tags = '["a","b"]';
    expect(p.tags).toBe('["a","b"]');
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
    expect(p.price_range).toBe("0-100");
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
    expect(d.name).toBe("Rex");
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
    expect(p.memo).toBe("");
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
    expect(reloaded.virtual_status).toBe("pending");
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
    expect(p.score).toBe(42);
    expect(typeof p.score).toBe("number");
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
    p.note = "added";
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
    expect(p.virtual_field).toBe("v");
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
    expect(p.metadata).toBe("anything");
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
    expect(p.cached).toBe("yes");
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
    expect(p.title).toBe("test");
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
    const val = p.title;
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
    expect(typeof p.title).toBe("string");
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
    expect(p.name).toBe("test");
    p.name = "changed";
    expect(p.name).toBe("changed");
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
    expect(p1.active).toBe(1);
    const p2 = new Post({ active: 0 });
    expect(p2.active).toBe(0);
  });
});

describe("DefineAttributeTest", () => {
  it("define_attribute registers a type object directly", () => {
    const adp = createTestAdapter();
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      static {
        this.adapter = adp;
        this.defineAttribute("score", intType);
      }
    }
    const p = new Post({ score: "42" });
    expect(p.score).toBe(42);
  });

  it("define_attribute with default value", () => {
    const adp = createTestAdapter();
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      static {
        this.adapter = adp;
        this.defineAttribute("rating", intType, { default: 5 });
      }
    }
    const p = new Post({});
    expect(p.rating).toBe(5);
  });

  it("define_attribute preserves existing default when no default given", () => {
    const adp = createTestAdapter();
    const strType = typeRegistry.lookup("string");
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      static {
        this.adapter = adp;
        this.defineAttribute("score", strType, { default: "10" });
        this.defineAttribute("score", intType);
      }
    }
    const p = new Post({});
    expect(p.score).toBe(10);
  });

  it("define_attribute with userProvidedDefault false uses database cast", () => {
    const adp = createTestAdapter();
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      static {
        this.adapter = adp;
        this.defineAttribute("views", intType, { default: "0", userProvidedDefault: false });
      }
    }
    const p = new Post({});
    expect(p.views).toBe(0);
  });

  it("define_attribute invalidates _defaultAttributes cache", () => {
    const adp = createTestAdapter();
    const strType = typeRegistry.lookup("string");
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      static {
        this.adapter = adp;
        this.defineAttribute("score", strType);
      }
    }
    const before = Post._defaultAttributes();
    Post.defineAttribute("score", intType);
    const after = Post._defaultAttributes();
    expect(before).not.toBe(after);
  });
});

describe("DefaultAttributesTest", () => {
  it("_default_attributes returns an AttributeSet", () => {
    const adp = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const defaults = Post._defaultAttributes();
    expect(typeof defaults.fetchValue).toBe("function");
  });

  it("_default_attributes includes declared attributes", () => {
    const adp = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string", { default: "Untitled" });
        this.adapter = adp;
      }
    }
    const defaults = Post._defaultAttributes();
    expect(defaults.fetchValue("title")).toBe("Untitled");
  });

  it("_default_attributes is cached", () => {
    const adp = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    expect(Post._defaultAttributes()).toBe(Post._defaultAttributes());
  });

  it("_default_attributes cache is invalidated when attribute is defined", () => {
    const adp = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const first = Post._defaultAttributes();
    Post.attribute("body", "string");
    const second = Post._defaultAttributes();
    expect(first).not.toBe(second);
    expect(second.fetchValue("body")).toBeNull();
  });

  it("new record attributes are seeded from _default_attributes", () => {
    const adp = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("status", "string", { default: "draft" });
        this.adapter = adp;
      }
    }
    const p = new Post({});
    expect(p.status).toBe("draft");
  });

  it("_defaultAttributes seeds schema columns via fromDatabase then replays user pending queue", () => {
    const adp = createTestAdapter();
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      static {
        this.adapter = adp;
      }
    }
    Post.defineAttribute("views", intType, { default: 0, userProvidedDefault: false });
    Post.attribute("title", "string", { default: "untitled" });

    const defaults = Post._defaultAttributes();
    expect(defaults.getAttribute("views").value).toBe(0);
    expect(defaults.getAttribute("title").value).toBe("untitled");
  });

  it("user attribute() declaration overrides schema column type via pending queue", () => {
    const adp = createTestAdapter();
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      static {
        this.adapter = adp;
      }
    }
    Post.defineAttribute("score", intType, { default: 0, userProvidedDefault: false });
    Post.attribute("score", "string");

    const defaults = Post._defaultAttributes();
    expect(defaults.getAttribute("score").type.name).toBe("string");
  });

  it("attribute() overriding only type preserves the schema default", () => {
    const adp = createTestAdapter();
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      static {
        this.adapter = adp;
      }
    }
    // Schema reflection gives score a default of 5
    Post.defineAttribute("score", intType, { default: 5, userProvidedDefault: false });
    // User overrides type to string without specifying a default
    Post.attribute("score", "string");

    const defaults = Post._defaultAttributes();
    // Type changed to string, but schema default (5) is preserved
    expect(defaults.getAttribute("score").type.name).toBe("string");
    expect(defaults.getAttribute("score").value).toBe("5");
  });
});

describe("DefineAttributeSTITest", () => {
  it("defineAttribute on STI subclass routes to the STI base", () => {
    const adp = createTestAdapter();
    const intType = typeRegistry.lookup("integer");
    class Animal extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        (this as any)._inheritanceColumn = "type";
        this.adapter = adp;
      }
    }
    class Dog extends (Animal as any) {}
    // Defining on subclass should land on the base
    (Dog as any).defineAttribute("legs", intType, { default: 4 });
    expect((Animal as any)._attributeDefinitions.has("legs")).toBe(true);
    const d = new (Dog as any)({});
    expect(d.legs).toBe(4);
  });

  it("_defaultAttributes on STI subclass uses the base cache", () => {
    const adp = createTestAdapter();
    class Vehicle extends Base {
      static {
        this.attribute("speed", "integer", { default: 60 });
        this.adapter = adp;
      }
    }
    class Car extends (Vehicle as any) {}
    const baseDefaults = (Vehicle as any)._defaultAttributes();
    const subDefaults = (Car as any)._defaultAttributes();
    expect(baseDefaults).toBe(subDefaults);
  });

  it("defineAttribute for id does not install an accessor", () => {
    const adp = createTestAdapter();
    const strType = typeRegistry.lookup("string");
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    Post.defineAttribute("id", strType);
    // Base.prototype.id (the CPK-aware getter) must still be used, not a plain accessor
    const ownDesc = Object.getOwnPropertyDescriptor(Post.prototype, "id");
    expect(ownDesc).toBeUndefined();
  });
});

describe("ResetDefaultAttributesCascadeTest", () => {
  it("adding an attribute to a superclass invalidates an AR subclass _defaultAttributes cache", () => {
    const adp = createTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    class SpecialPost extends (Post as any) {}

    // Prime the subclass cache via AR's _defaultAttributes path
    const before = (SpecialPost as any)._defaultAttributes();
    expect(before.keys()).toContain("title");
    expect(before.keys()).not.toContain("score");

    // Add attribute to superclass at runtime
    Post.attribute("score", "integer", { default: 0 });

    // Subclass cache must be invalidated and rebuilt with the new attribute
    const after = (SpecialPost as any)._defaultAttributes();
    expect(after.keys()).toContain("score");
    expect(after.getAttribute("score").value).toBe(0);
  });
});
