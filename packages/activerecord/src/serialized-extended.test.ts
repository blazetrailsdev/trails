/**
 * Extended serialized attribute tests.
 * Mirrors: activerecord/test/cases/serialized_attribute_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, serialize } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// SerializedAttributeTest
// ==========================================================================

describe("SerializedAttributeTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("serialized attribute — stores and retrieves JSON", async () => {
    class Topic extends Base {
      static { this.attribute("content", "string"); }
    }
    Topic.adapter = adapter;
    serialize(Topic, "content", { coder: "json" });

    const topic = new Topic({});
    topic.writeAttribute("content", JSON.stringify({ foo: "bar" }));
    // readAttribute should deserialize the JSON string
    expect(topic.readAttribute("content")).toEqual({ foo: "bar" });
  });

  it("serialized attribute with custom coder", async () => {
    const customCoder = {
      dump(value: unknown): string {
        return `CUSTOM:${JSON.stringify(value)}`;
      },
      load(raw: unknown): unknown {
        if (typeof raw === "string" && raw.startsWith("CUSTOM:")) {
          return JSON.parse(raw.slice(7));
        }
        return raw;
      },
    };

    class Settings extends Base {
      static { this.attribute("data", "string"); }
    }
    Settings.adapter = adapter;
    serialize(Settings, "data", { coder: customCoder });

    const s = new Settings({});
    s.writeAttribute("data", customCoder.dump({ key: "value" }));
    expect(s.readAttribute("data")).toEqual({ key: "value" });
  });

  it("serialized attribute with array coder returns array", async () => {
    class TagList extends Base {
      static { this.attribute("tags", "string"); }
    }
    TagList.adapter = adapter;
    serialize(TagList, "tags", { coder: "array" });

    const t = new TagList({});
    t.writeAttribute("tags", JSON.stringify(["a", "b", "c"]));
    expect(t.readAttribute("tags")).toEqual(["a", "b", "c"]);
  });

  it("serialized attribute with array coder returns [] for null", async () => {
    class TagList2 extends Base {
      static { this.attribute("tags", "string"); }
    }
    TagList2.adapter = adapter;
    serialize(TagList2, "tags", { coder: "array" });

    const t = new TagList2({});
    t.writeAttribute("tags", null as any);
    expect(t.readAttribute("tags")).toEqual([]);
  });

  it("serialized attribute with hash coder returns hash", async () => {
    class Prefs extends Base {
      static { this.attribute("settings", "string"); }
    }
    Prefs.adapter = adapter;
    serialize(Prefs, "settings", { coder: "hash" });

    const p = new Prefs({});
    p.writeAttribute("settings", JSON.stringify({ theme: "dark" }));
    expect(p.readAttribute("settings")).toEqual({ theme: "dark" });
  });

  it("serialized attribute with hash coder returns {} for null", async () => {
    class Prefs2 extends Base {
      static { this.attribute("settings", "string"); }
    }
    Prefs2.adapter = adapter;
    serialize(Prefs2, "settings", { coder: "hash" });

    const p = new Prefs2({});
    p.writeAttribute("settings", null as any);
    expect(p.readAttribute("settings")).toEqual({});
  });

  it("nil serialized attribute without coder constraint returns null", async () => {
    class Doc extends Base {
      static { this.attribute("body", "string"); }
    }
    Doc.adapter = adapter;
    serialize(Doc, "body");

    const d = new Doc({});
    d.writeAttribute("body", null as any);
    expect(d.readAttribute("body")).toBeNull();
  });

  it("serialized attribute returns object when raw is already JSON string", async () => {
    class Config extends Base {
      static { this.attribute("options", "string"); }
    }
    Config.adapter = adapter;
    serialize(Config, "options", { coder: "json" });

    const c = new Config({});
    c.writeAttribute("options", JSON.stringify({ already: "parsed" }));
    expect(c.readAttribute("options")).toEqual({ already: "parsed" });
  });

  it("serialized attribute handles JSON parse errors gracefully", async () => {
    class Blob extends Base {
      static { this.attribute("data", "string"); }
    }
    Blob.adapter = adapter;
    serialize(Blob, "data", { coder: "json" });

    const b = new Blob({});
    b.writeAttribute("data", "not valid json" as any);
    // Should return the raw string (not throw)
    expect(b.readAttribute("data")).toBe("not valid json");
  });

  it("multiple serialized attributes on same class", async () => {
    class Multi extends Base {
      static {
        this.attribute("tags", "string");
        this.attribute("meta", "string");
      }
    }
    Multi.adapter = adapter;
    serialize(Multi, "tags", { coder: "array" });
    serialize(Multi, "meta", { coder: "hash" });

    const m = new Multi({});
    m.writeAttribute("tags", JSON.stringify(["x", "y"]));
    m.writeAttribute("meta", JSON.stringify({ foo: 1 }));
    expect(m.readAttribute("tags")).toEqual(["x", "y"]);
    expect(m.readAttribute("meta")).toEqual({ foo: 1 });
  });

  it("non-serialized attributes are unaffected", async () => {
    class Mixed extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("data", "string");
      }
    }
    Mixed.adapter = adapter;
    serialize(Mixed, "data", { coder: "json" });

    const m = new Mixed({ name: "Alice", data: JSON.stringify({ x: 1 }) });
    expect(m.readAttribute("name")).toBe("Alice");
    expect(m.readAttribute("data")).toEqual({ x: 1 });
  });

  it("serialize with no options defaults to JSON coder", async () => {
    class JsonDefault extends Base {
      static { this.attribute("payload", "string"); }
    }
    JsonDefault.adapter = adapter;
    serialize(JsonDefault, "payload");

    const j = new JsonDefault({});
    j.writeAttribute("payload", JSON.stringify([1, 2, 3]));
    expect(j.readAttribute("payload")).toEqual([1, 2, 3]);
  });

  it("serialized attribute with boolean true", async () => {
    class Flags extends Base {
      static { this.attribute("active", "string"); }
    }
    Flags.adapter = adapter;
    serialize(Flags, "active", { coder: "json" });

    const f = new Flags({});
    f.writeAttribute("active", "true");
    expect(f.readAttribute("active")).toBe(true);
  });

  it("serialized attribute with boolean false", async () => {
    class Flags2 extends Base {
      static { this.attribute("active", "string"); }
    }
    Flags2.adapter = adapter;
    serialize(Flags2, "active", { coder: "json" });

    const f = new Flags2({});
    f.writeAttribute("active", "false");
    expect(f.readAttribute("active")).toBe(false);
  });

  it("serialized attribute with numeric value", async () => {
    class Counter extends Base {
      static { this.attribute("count", "string"); }
    }
    Counter.adapter = adapter;
    serialize(Counter, "count", { coder: "json" });

    const c = new Counter({});
    c.writeAttribute("count", "42");
    expect(c.readAttribute("count")).toBe(42);
  });
});
