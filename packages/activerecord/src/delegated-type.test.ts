/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, delegatedType } from "./index.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("DelegatedTypeTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModels() {
    class Entry extends Base {
      static {
        this.attribute("entryable_id", "integer");
        this.attribute("entryable_type", "string");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry, "entryable", { types: ["Message", "Comment"] });
    return { Entry };
  }

  it("delegated types", () => {
    const { Entry } = makeModels();
    const e = new Entry({ title: "hi", entryable_type: "Message", entryable_id: 1 });
    expect(e.readAttribute("entryable_type")).toBe("Message");
  });

  it("delegated class", () => {
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 1 });
    expect((e as any).entryableClass).toBe("Message");
  });

  it("delegated class with custom foreign_type", () => {
    class Entry2 extends Base {
      static {
        this.attribute("custom_type", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry2, "entryable", {
      types: ["Message"],
      foreignType: "custom_type",
      foreignKey: "custom_id",
    });
    const e = new Entry2({ custom_type: "Message", custom_id: 1 });
    expect((e as any).entryableClass).toBe("Message");
  });

  it("delegated type name", () => {
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 1 });
    expect((e as any).entryableName).toBe("message");
  });

  it("delegated type predicates", () => {
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 1 });
    expect((e as any).isMessage()).toBe(true);
    expect((e as any).isComment()).toBe(false);
  });

  it("delegated type predicates with custom foreign_type", () => {
    class Entry2 extends Base {
      static {
        this.attribute("custom_type", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry2, "entryable", {
      types: ["Message", "Comment"],
      foreignType: "custom_type",
      foreignKey: "custom_id",
    });
    const e = new Entry2({ custom_type: "Comment", custom_id: 1 });
    expect((e as any).isComment()).toBe(true);
    expect((e as any).isMessage()).toBe(false);
  });

  it("scope", async () => {
    const { Entry } = makeModels();
    await Entry.create({ title: "a", entryable_type: "Message", entryable_id: 1 });
    await Entry.create({ title: "b", entryable_type: "Comment", entryable_id: 2 });
    const messages = await (Entry as any).messages().toArray();
    expect(messages.length).toBe(1);
    expect(messages[0].readAttribute("title")).toBe("a");
  });

  it("scope with custom foreign_type", async () => {
    class Entry2 extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("custom_type", "string");
        this.attribute("custom_id", "integer");
        this.adapter = adapter;
      }
    }
    delegatedType(Entry2, "entryable", {
      types: ["Message", "Comment"],
      foreignType: "custom_type",
      foreignKey: "custom_id",
    });
    await Entry2.create({ title: "a", custom_type: "Message", custom_id: 1 });
    await Entry2.create({ title: "b", custom_type: "Comment", custom_id: 2 });
    const comments = await (Entry2 as any).comments().toArray();
    expect(comments.length).toBe(1);
    expect(comments[0].readAttribute("title")).toBe("b");
  });

  it("accessor", () => {
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 42 });
    expect((e as any).message).toBe(42);
    expect((e as any).comment).toBeNull();
  });

  it("association id", () => {
    const { Entry } = makeModels();
    const e = new Entry({ entryable_type: "Message", entryable_id: 99 });
    expect(e.readAttribute("entryable_id")).toBe(99);
  });

  it.skip("association uuid", () => {
    /* needs UUID primary key support */
  });

  it.skip("touch account", () => {
    /* needs touch support on polymorphic association */
  });

  it("builder method", () => {
    const { Entry } = makeModels();
    const e = new Entry({ title: "test" });
    (e as any).buildMessage({ entryable_id: 5 });
    expect(e.readAttribute("entryable_type")).toBe("Message");
    expect(e.readAttribute("entryable_id")).toBe(5);
  });
});
