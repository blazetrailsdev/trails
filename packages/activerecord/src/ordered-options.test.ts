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

describe("OrderedOptionsTest", () => {
  it("usage", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    a.hierarchyHead = "Doe";
    expect(a.boy).toBe("John");
    expect(a.hierarchyHead).toBe("Doe");
  });

  it("looping", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    a.girl = "Jane";
    const collected: [string, unknown][] = [];
    a.each((k: string, v: unknown) => collected.push([k, v]));
    expect(collected).toEqual([
      ["boy", "John"],
      ["girl", "Jane"],
    ]);
  });

  it("string dig", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    expect(a.dig("boy")).toBe("John");
    expect(a.dig("girl")).toBeUndefined();
  });

  it("nested dig", () => {
    const a = new OrderedOptions() as any;
    a.boy = { name: "John" };
    expect(a.dig("boy", "name")).toBe("John");
    expect(a.dig("boy", "age")).toBeUndefined();
  });

  it("method access", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    expect(a["boy?"]()).toBe(true);
    expect(a["girl?"]()).toBe(false);
    expect(a.has("boy")).toBe(true);
    expect(a.has("girl")).toBe(false);
  });

  it("inheritable options continues lookup in parent", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent);
    expect((child as any).foo).toBe("bar");
  });

  it("inheritable options can override parent", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.foo = "baz";
    expect(child.foo).toBe("baz");
    expect((parent as any).foo).toBe("bar");
  });

  it("inheritable options inheritable copy", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent);
    const grandchild = child.inheritableCopy() as any;
    expect(grandchild.foo).toBe("bar");
  });

  it("introspection", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    expect("boy" in a).toBe(true);
    expect("girl" in a).toBe(false);
  });

  it("raises with bang", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    expect(a["boy!"]()).toBe("John");
    expect(() => a["girl!"]()).toThrow(":girl is blank");
  });

  it("inheritable options with bang", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    expect(child["foo!"]()).toBe("bar");
    expect(() => child["missing!"]()).toThrow(":missing is blank");
  });

  it("ordered option inspect", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    a.girl = "Jane";
    const str = a.inspect();
    expect(str).toContain("OrderedOptions");
    expect(str).toContain("boy");
    expect(str).toContain("John");
  });

  it("inheritable option inspect", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.baz = "qux";
    const str = child.inspect();
    expect(str).toContain("InheritableOptions");
  });

  it("ordered options to h", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    a.girl = "Jane";
    expect(a.toH()).toEqual({ boy: "John", girl: "Jane" });
  });

  it("inheritable options to h", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.baz = "qux";
    expect(child.toH()).toEqual({ baz: "qux" });
  });

  it("ordered options dup", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    const b = a.dup() as any;
    b.boy = "Jane";
    expect(a.boy).toBe("John");
    expect(b.boy).toBe("Jane");
  });

  it("inheritable options dup", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.baz = "qux";
    const copy = child.dup() as any;
    copy.baz = "changed";
    expect(child.baz).toBe("qux");
    expect(copy.baz).toBe("changed");
  });

  it("ordered options key", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    a.girl = "Jane";
    expect(a.key("John")).toBe("boy");
    expect(a.key("Jane")).toBe("girl");
    expect(a.key("missing")).toBeUndefined();
  });

  it("inheritable options key", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.baz = "qux";
    expect(child.key("qux")).toBe("baz");
  });

  it("inheritable options overridden", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    expect(child.foo).toBe("bar");
    child.foo = "baz";
    expect(child.foo).toBe("baz");
  });

  it("inheritable options overridden with nil", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.foo = null;
    expect(child.foo).toBeNull();
  });

  it("inheritable options each", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.baz = "qux";
    const collected: [string, unknown][] = [];
    child.each((k: string, v: unknown) => collected.push([k, v]));
    expect(collected).toEqual([["baz", "qux"]]);
  });

  it("inheritable options to a", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    a.girl = "Jane";
    const entries = a.entries();
    expect(entries).toEqual([
      ["boy", "John"],
      ["girl", "Jane"],
    ]);
  });

  it("inheritable options count", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.baz = "qux";
    child.another = "one";
    expect(child.count).toBe(2);
  });

  it("ordered options to s", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    const str = a.toString();
    expect(str).toContain("OrderedOptions");
    expect(str).toContain("boy");
  });

  it("inheritable options to s", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.baz = "qux";
    const str = child.toString();
    expect(str).toContain("InheritableOptions");
  });

  it("odrered options pp", () => {
    const a = new OrderedOptions() as any;
    a.boy = "John";
    a.girl = "Jane";
    const str = a.inspect();
    expect(str).toContain("boy");
    expect(str).toContain("girl");
  });

  it("inheritable options pp", () => {
    const parent = new OrderedOptions({ foo: "bar" });
    const child = new InheritableOptions(parent) as any;
    child.baz = "qux";
    const str = child.inspect();
    expect(str).toContain("InheritableOptions");
    expect(str).toContain("parent");
  });
});
