import { describe, it, expect } from "vitest";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set/builder.js";
import {
  AttributeMutationTracker,
  ForcedMutationTracker,
  NullMutationTracker,
} from "./attribute-mutation-tracker.js";
import { typeRegistry } from "./type/registry.js";

function buildSet(values: Record<string, unknown>): AttributeSet {
  const attrs = new Map<string, import("./attribute.js").Attribute>();
  for (const [name, value] of Object.entries(values)) {
    const type =
      typeof value === "number" ? typeRegistry.lookup("integer") : typeRegistry.lookup("string");
    attrs.set(name, Attribute.fromUserWithValue(name, value, value, type));
  }
  return new AttributeSet(attrs);
}

describe("AttributeMutationTracker", () => {
  it("reports no changes on fresh attributes", () => {
    const set = buildSet({ name: "Alice", age: 30 });
    const tracker = new AttributeMutationTracker(set);
    expect(tracker.anyChanges()).toBe(false);
    expect(tracker.changedAttributeNames()).toEqual([]);
    expect(tracker.changes()).toEqual({});
  });

  it("detects changes after writeFromUser", () => {
    const set = buildSet({ name: "Alice", age: 30 });
    const tracker = new AttributeMutationTracker(set);

    set.writeFromUser("name", "Bob");
    expect(tracker.anyChanges()).toBe(true);
    expect(tracker.changedAttributeNames()).toContain("name");
    expect(tracker.changeToAttribute("name")).toEqual(["Alice", "Bob"]);
  });

  it("originalValue returns the value before change", () => {
    const set = buildSet({ name: "Alice" });
    const tracker = new AttributeMutationTracker(set);

    set.writeFromUser("name", "Bob");
    expect(tracker.originalValue("name")).toBe("Alice");
  });

  it("forceChange marks an attribute as changed", () => {
    const set = buildSet({ name: "Alice" });
    const tracker = new AttributeMutationTracker(set);

    tracker.forceChange("name");
    expect(tracker.anyChanges()).toBe(true);
    expect(tracker.isChanged("name")).toBe(true);
  });

  it("forgetChange clears a forced change", () => {
    const set = buildSet({ name: "Alice" });
    const tracker = new AttributeMutationTracker(set);

    tracker.forceChange("name");
    tracker.forgetChange("name");
    expect(tracker.isChanged("name")).toBe(false);
  });

  it("isChanged with from/to options", () => {
    const set = buildSet({ name: "Alice" });
    const tracker = new AttributeMutationTracker(set);

    set.writeFromUser("name", "Bob");
    expect(tracker.isChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
    expect(tracker.isChanged("name", { from: "Charlie" })).toBe(false);
    expect(tracker.isChanged("name", { to: "Charlie" })).toBe(false);
  });

  it("changedValues returns original values for changed attrs", () => {
    const set = buildSet({ name: "Alice", age: 30 });
    const tracker = new AttributeMutationTracker(set);

    set.writeFromUser("name", "Bob");
    const changed = tracker.changedValues();
    expect(changed.name).toBe("Alice");
    expect(changed.age).toBeUndefined();
  });
});

describe("ForcedMutationTracker", () => {
  it("only tracks forced changes", () => {
    const set = buildSet({ name: "Alice" });
    const tracker = new ForcedMutationTracker(set);

    expect(tracker.anyChanges()).toBe(false);
    tracker.forceChange("name");
    expect(tracker.anyChanges()).toBe(true);
  });

  it("originalValue returns the forced value", () => {
    const set = buildSet({ name: "Alice" });
    const tracker = new ForcedMutationTracker(set);

    tracker.forceChange("name");
    expect(tracker.originalValue("name")).toBe("Alice");

    set.writeFromUser("name", "Bob");
    expect(tracker.originalValue("name")).toBe("Alice");
  });

  it("finalizeChanges captures current state", () => {
    const set = buildSet({ name: "Alice" });
    const tracker = new ForcedMutationTracker(set);

    tracker.forceChange("name");
    set.writeFromUser("name", "Bob");
    tracker.finalizeChanges();

    const change = tracker.changeToAttribute("name");
    expect(change).toEqual(["Alice", "Bob"]);
  });
});

describe("NullMutationTracker", () => {
  it("always reports no changes", () => {
    const tracker = new NullMutationTracker();
    expect(tracker.anyChanges()).toBe(false);
    expect(tracker.changedAttributeNames()).toEqual([]);
    expect(tracker.changes()).toEqual({});
    expect(tracker.isChanged("anything")).toBe(false);
    expect(tracker.originalValue("anything")).toBeUndefined();
    expect(tracker.changeToAttribute("anything")).toBeUndefined();
  });
});
