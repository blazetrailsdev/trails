import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { createSidecarTestAdapter } from "../test-adapter.js";
import {
  defineAttributeMethods,
  isAttributeMethodsGenerated,
  attributeNames,
} from "../attribute-methods.js";

describe("ReadTest", () => {
  // Mirrors read_test.rb's synthetic `@klass` (attribute_names %w{one two
  // three}, empty attribute_types): a minimal AttributeMethods host whose
  // accessors are NOT eagerly generated, so we can observe lazy generation
  // via `define_attribute_methods`. A real Base subclass generates accessors
  // eagerly at `attribute()` declaration, which would mask the gate.
  function buildKlass() {
    class Klass {
      static _attributeDefinitions = new Map<string, { name: string }>([
        ["one", { name: "one" }],
        ["two", { name: "two" }],
        ["three", { name: "three" }],
      ]);
      static _attributeMethodsGenerated = false;
      static defineAttributeMethods = defineAttributeMethods;
      static attributeMethodsGenerated = isAttributeMethodsGenerated;
      static attributeNames = attributeNames;
    }
    return Klass;
  }

  it("define attribute methods", () => {
    const Klass = buildKlass();
    const instance = new Klass();

    for (const name of Klass.attributeNames()) {
      expect(name in instance).toBe(false);
    }

    Klass.defineAttributeMethods();

    for (const name of Klass.attributeNames()) {
      expect(name in instance).toBe(true);
    }
  });

  it("attribute methods generated?", () => {
    const Klass = buildKlass();

    expect("one" in Klass.prototype).toBe(false);
    expect(Klass.attributeMethodsGenerated()).toBe(false);

    Klass.defineAttributeMethods();

    expect("one" in Klass.prototype).toBe(true);
    expect(Klass.attributeMethodsGenerated()).toBe(true);
  });

  it("_read_attribute returns value for existing attribute", () => {
    createSidecarTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post({ title: "hello" });
    expect(p._readAttribute("title")).toBe("hello");
  });

  it("_read_attribute returns null for unset attribute", () => {
    createSidecarTestAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post({});
    expect(p._readAttribute("title")).toBeNull();
  });

  it("_read_attribute does not apply alias resolution", () => {
    createSidecarTestAdapter();
    class Post extends Base {
      static {
        this.attribute("body", "string");
        this.aliasAttribute("content", "body");
      }
    }
    const p = new Post({ body: "text" });
    expect(p._readAttribute("body")).toBe("text");
    expect(p._readAttribute("content")).toBeNull();
  });
});
