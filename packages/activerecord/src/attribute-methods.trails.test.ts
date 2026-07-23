/**
 * Trails-specific invariants relocated out of attribute-methods.test.ts
 * (RFC 0043 extra-test burndown). These guard trails-internal mechanisms with
 * no Rails counterpart in attribute_methods_test.rb: the `formatForInspect`
 * helper, attribute-method generation (`defineAttributeMethods` cascade and
 * accessor-override preservation), `arelTable.get` alias passthrough,
 * `hasAttribute` alias resolution, and the readonly-attribute raise. Test names
 * are kept verbatim per CLAUDE.md.
 */
import { describe, it, expect } from "vitest";
import { Base, ReadonlyAttributeError, registerModel } from "./index.js";
import { formatForInspect } from "./attribute-inspection.js";

import { fixtures } from "./test-helpers/fixtures.js";
import { Minivan } from "./test-helpers/models/minivan.js";

registerModel(Minivan);

/** Internal attribute-method generation surface exercised by these tests. */
interface Generatable {
  defineAttributeMethods(): void;
  _attributeMethodsGenerated?: boolean;
}
const generatable = (cls: unknown): Generatable => cls as Generatable;

describe("AttributeMethodsTest (trails)", () => {
  fixtures([]);

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

  it("resolves snake_case lookups against camelCase alias keys", () => {
    // Trails stores alias keys camelCase while derived names (counter-cache
    // columns, DB column names) are snake_case; Rails needs no such bridge
    // because its alias keys already match its column naming.
    class Topic extends Base {
      static {
        this.attribute("legacy_comments_count", "integer");
        this.aliasAttribute("commentsCount", "legacy_comments_count");
      }
    }
    expect(Topic.hasAttribute("commentsCount")).toBe(true);
    expect(Topic.hasAttribute("comments_count")).toBe(true);
    expect(Topic.hasAttribute("legacy_comments_count")).toBe(true);
    expect(Topic.hasAttribute("replies_count")).toBe(false);
  });

  it("prefers a real class attribute over the camelCase alias bridge", () => {
    // The bridge must not hijack a name the model really owns: with both a real
    // `new_name` column and an unrelated `newName` alias, Rails resolves
    // `new_name` to its own column, so trails must too.
    class Topic extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("new_name", "string");
        this.aliasAttribute("newName", "name");
      }
    }
    expect(Topic.hasAttribute("new_name")).toBe(true);
    const t = new Topic({ name: "a", new_name: "b" });
    expect(t.readAttribute("new_name")).toBe("b");
    expect(t.readAttribute("newName")).toBe("a");
  });

  it("resolves the camelCase bridge identically for has/read/write", () => {
    // Rails runs one identical alias step in has_attribute?
    // (attribute_methods.rb:316-319), read_attribute (read.rb:31-34) and
    // write_attribute (write.rb:31-34). The trails bridge must be shared by all
    // three, or an attribute can report present while reads return nil.
    class Topic extends Base {
      static {
        this.attribute("legacy_comments_count", "integer");
        this.aliasAttribute("commentsCount", "legacy_comments_count");
      }
    }
    const t = Topic.instantiate({ legacy_comments_count: 7 });
    expect(t.hasAttribute("comments_count")).toBe(true);
    expect(t.readAttribute("comments_count")).toBe(7);
    t.writeAttribute("comments_count", 9);
    expect(t.readAttribute("legacy_comments_count")).toBe(9);
  });

  it("prefers a loaded attribute over the camelCase alias bridge", () => {
    // Rails' instance has_attribute? checks the loaded @attributes
    // (attribute_methods.rb:316-319), which can hold names the class does not
    // declare — a projected `SELECT COUNT(*) AS comments_count`, say. Such a
    // name must resolve to the loaded value, not to an unrelated
    // `commentsCount` alias, so the bridge has to run after the exact lookup.
    class Topic extends Base {
      static {
        this.attribute("legacy_comments_count", "integer");
        this.aliasAttribute("commentsCount", "legacy_comments_count");
      }
    }
    const t = Topic.instantiate({ legacy_comments_count: 7, comments_count: 42 });
    expect(t.hasAttribute("comments_count")).toBe(true);
    expect(t.readAttribute("comments_count")).toBe(42);
    expect(t.readAttribute("commentsCount")).toBe(7);
    // The write path must agree with the read path about which one it means.
    t.writeAttribute("comments_count", 43);
    expect(t.readAttribute("comments_count")).toBe(43);
    expect(t.readAttribute("legacy_comments_count")).toBe(7);
  });

  it("readonly attributes are not updated after create", async () => {
    // Rails raises ReadonlyAttributeError on a persisted-record write to an
    // attr_readonly column (readonly_attributes.rb line 49). The test name's
    // "are not updated" wording pre-dates Rails adding the raise; the
    // attribute isn't updated because the write itself is rejected. Minivan
    // (models/minivan.rb) declares `attr_readonly :color`.
    const minivan = await Minivan.create({ minivan_id: "mv1", color: "blue", name: "Rebel" });
    expect(() => {
      minivan.color = "red";
    }).toThrow(ReadonlyAttributeError);
    minivan.name = "Updated";
    await minivan.save();
    const found = await Minivan.find("mv1");
    expect(found.color).toBe("blue");
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

  // Rails' class-level `attribute_names` is `@attribute_names ||= ...freeze`
  // (attribute_methods.rb:236-241), invalidated by reload_schema_from_cache.
  // These guard the trails port of that memo and its cold-cache carve-out.
  it("class attributeNames is memoized and frozen", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const first = Topic.attributeNames();
    expect(first).toContain("title");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Topic.attributeNames()).toBe(first);
  });

  it("resetColumnInformation invalidates the class attributeNames memo", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const first = Topic.attributeNames();
    (Topic as unknown as { resetColumnInformation(): void }).resetColumnInformation();
    // The reset also drops the shared cache's per-table entry; re-reflect so
    // the comparison sees real columns (and the suite's warm-cache invariant
    // is restored for later tests).
    await Topic.loadSchema();
    const second = Topic.attributeNames();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("subclass does not inherit the parent's attributeNames memo", async () => {
    class Topic extends Base {}
    await Topic.loadSchema();
    const parentNames = Topic.attributeNames();
    class ImportantTopic extends Topic {}
    // Rails nils @attribute_names in `inherited`; the subclass memoizes its
    // own array rather than reading the parent's.
    expect(ImportantTopic.attributeNames()).not.toBe(parentNames);
  });

  it("does not memoize the cold-cache fail-open attributeNames answer", async () => {
    class NonExistentTable extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    // Cold cache: the table has never hit a dataSourceExists check, so the
    // table_exists? half of the guard fails open (documented inherent
    // deviation — Rails' sync DB hit would return []).
    expect(NonExistentTable.attributeNames()).toEqual(["name"]);
    // The async pipeline records dataSourceExists=false; the cold answer
    // must not have been memoized, so the guard now closes.
    await NonExistentTable.loadSchema();
    expect(NonExistentTable.attributeNames()).toEqual([]);
  });
});
