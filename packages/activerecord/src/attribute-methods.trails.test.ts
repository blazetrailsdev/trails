/**
 * Trails-specific invariants relocated out of attribute-methods.test.ts
 * (RFC 0043 extra-test burndown). These guard trails-internal mechanisms with
 * no Rails counterpart in attribute_methods_test.rb: the `formatForInspect`
 * helper, attribute-method generation (`defineAttributeMethods` cascade and
 * accessor-override preservation), `arelTable.get` alias passthrough,
 * `hasAttribute` alias resolution, and the readonly-attribute raise. Test names
 * are kept verbatim per CLAUDE.md.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, ReadonlyAttributeError } from "./index.js";
import { formatForInspect } from "./attribute-inspection.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA = {
  items: {
    name: "string",
    count: "integer",
    code: "string",
  },
} as const;

/** Internal attribute-method generation surface exercised by these tests. */
interface Generatable {
  defineAttributeMethods(): void;
  _attributeMethodsGenerated?: boolean;
}
const generatable = (cls: unknown): Generatable => cls as Generatable;

describe("AttributeMethodsTest (trails)", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  it("defineAttributeMethods cascades to the superclass", async () => {
    class Animal extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Dog extends Animal {
      static {
        this.attribute("breed", "string");
      }
    }
    // Generating the subclass drives the parent's generation first, so the
    // parent's own flag is set even though it was never generated directly.
    generatable(Dog).defineAttributeMethods();
    expect(Object.prototype.hasOwnProperty.call(Animal, "_attributeMethodsGenerated")).toBe(true);
    expect(generatable(Animal)._attributeMethodsGenerated).toBe(true);
    expect(generatable(Dog)._attributeMethodsGenerated).toBe(true);
  });

  it("formatForInspect renders a valid Date as a quoted ISO string", () => {
    class M extends Base {}
    const out = formatForInspect.call(new M(), "x", new Date("2026-04-15T12:00:00.000Z"));
    expect(out).toBe('"2026-04-15T12:00:00.000Z"');
  });

  it("formatForInspect renders an invalid Date as quoted 'Invalid Date'", () => {
    class M extends Base {}
    const out = formatForInspect.call(new M(), "x", new Date(NaN));
    expect(out).toBe('"Invalid Date"');
  });

  it("formatForInspect does not crash for array containing an object with bigint values", () => {
    class M extends Base {}
    expect(() => formatForInspect.call(new M(), "x", [{ a: 1n }])).not.toThrow();
    expect(formatForInspect.call(new M(), "x", [{ a: 1n }])).toBe('[{"a":"1"}]');
  });

  it("returns true for alias_attribute names on instances", () => {
    // Rails `has_attribute?` resolves attribute_aliases
    // (active_record/attribute_methods.rb).
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.aliasAttribute("heading", "title");
      }
    }
    const t = new Topic({ title: "Hi" });
    expect(t.hasAttribute("heading")).toBe(true);
    expect(t.hasAttribute("title")).toBe(true);
    expect(t.hasAttribute("missing")).toBe(false);
  });

  it("readonly attributes are not updated after create", async () => {
    // Rails raises ReadonlyAttributeError on a persisted-record write to an
    // attr_readonly column (readonly_attributes.rb line 49). The test name's
    // "are not updated" wording pre-dates Rails adding the raise; the
    // attribute isn't updated because the write itself is rejected.
    class Item extends Base {
      static {
        this.attribute("code", "string");
        this.attribute("name", "string");
        this.attrReadonly("code");
      }
    }
    const item = await Item.create({ code: "ABC", name: "Widget" });
    expect(() => {
      item.code = "XYZ";
    }).toThrow(ReadonlyAttributeError);
    item.name = "Updated";
    await item.save();
    const found = await Item.find(item.id);
    expect(found.code).toBe("ABC");
    expect(found.name).toBe("Updated");
  });

  it("arelTable.get passthrough for unaliased attribute", () => {
    class User extends Base {
      static {
        this.attribute("username", "string");
        this.aliasAttribute("login", "username");
      }
    }
    const attr = User.arelTable.get("username");
    expect(attr.name).toBe("username");
  });

  // Rails: a model that overrides only the writer still gets the generated reader
  // (activerecord/test/models/bulb.rb:27-29 — color= override, no explicit reader).
  it("setter-only override does not suppress generated reader", () => {
    class Widget extends Base {
      static {
        this.attribute("color", "string");
      }
      set color(v: string) {
        this.writeAttribute("color", v.toUpperCase());
      }
    }
    generatable(Widget).defineAttributeMethods();
    const desc = Object.getOwnPropertyDescriptor(Widget.prototype, "color");
    expect(desc?.get).toBeDefined();
    expect(desc?.set).toBeDefined();
  });

  it("getter-only override does not suppress generated setter", () => {
    class Widget extends Base {
      static {
        this.attribute("color", "string");
      }
      get color(): unknown {
        return (this.readAttribute("color") as string | null)?.toLowerCase() ?? null;
      }
    }
    generatable(Widget).defineAttributeMethods();
    const desc = Object.getOwnPropertyDescriptor(Widget.prototype, "color");
    expect(desc?.get).toBeDefined();
    expect(desc?.set).toBeDefined();
  });

  it("full accessor override is not clobbered by generation", () => {
    class Widget extends Base {
      static {
        this.attribute("color", "string");
      }
      get color(): unknown {
        return "fixed";
      }
      set color(_v: unknown) {}
    }
    generatable(Widget).defineAttributeMethods();
    const w = new Widget({});
    expect((w as { color: unknown }).color).toBe("fixed");
  });
});
