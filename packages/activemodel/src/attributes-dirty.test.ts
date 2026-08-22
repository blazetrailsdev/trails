import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("AttributesDirtyTest", () => {
  it("changing the attribute reports a change only when the cast value changes", () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ age: 25 });
    p._writeAttribute("age", "25");
    expect(p.attributeChanged("age")).toBe(false);
  });

  it("changes accessible through both strings and symbols", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    expect(p.changes["name"]).toEqual(["Alice", "Bob"]);
  });

  it("be consistent with symbols arguments after the changes are applied", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    p.changesApplied();
    expect(p.previousChanges["name"]).toEqual(["Alice", "Bob"]);
    expect(p.attributeChanged("name")).toBe(false);
  });

  it("restore_attributes can restore only some attributes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 25 });
    p._writeAttribute("name", "Bob");
    p._writeAttribute("age", 30);
    p.clearAttributeChanges(["name"]);
    expect(p.attributeChanged("name")).toBe(false);
    expect(p.attributeChanged("age")).toBe(true);
  });

  class DirtyPerson extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
      this.attribute("color", "string");
    }
  }

  it("setting attribute will result in change", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    expect(p.isChanged).toBe(true);
  });

  it("list of changed attribute keys", () => {
    const p = new DirtyPerson({ name: "Alice", age: 25 });
    p._writeAttribute("name", "Bob");
    expect(p.changed).toContain("name");
    expect(p.changed).not.toContain("age");
  });

  it("changes to attribute values", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    expect(p.attributeChange("name")).toEqual(["Alice", "Bob"]);
  });

  it("checking if an attribute has changed to a particular value", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    expect(p.attributeChanged("name", { to: "Bob" })).toBe(true);
    expect(p.attributeChanged("name", { to: "Charlie" })).toBe(false);
  });

  it("setting color to same value should not result in change being recorded", () => {
    const p = new DirtyPerson({ color: "red" });
    p._writeAttribute("color", "red");
    expect(p.isChanged).toBe(false);
  });

  it("saving should reset model's changed status", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    expect(p.isChanged).toBe(true);
    p.changesApplied();
    expect(p.isChanged).toBe(false);
  });

  it("saving should preserve previous changes", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    p.changesApplied();
    expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
  });

  it("setting new attributes should not affect previous changes", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    p.changesApplied();
    p._writeAttribute("name", "Charlie");
    expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
  });

  it("saving should preserve model's previous changed status", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    p.changesApplied();
    expect(p.attributePreviouslyChanged("name")).toBe(true);
  });

  it("previous value is preserved when changed after save", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    p.changesApplied();
    p._writeAttribute("name", "Charlie");
    expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
    expect(p.changes).toEqual({ name: ["Bob", "Charlie"] });
  });

  it("changing the same attribute multiple times retains the correct original value", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    p._writeAttribute("name", "Charlie");
    expect(p.attributeChange("name")).toEqual(["Alice", "Charlie"]);
  });

  it("clear_changes_information should reset all changes", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    p.changesApplied();
    p._writeAttribute("name", "Charlie");
    p.clearChangesInformation();
    expect(p.isChanged).toBe(false);
    expect(Object.keys(p.previousChanges).length).toBe(0);
  });

  it("restore_attributes should restore all previous data", () => {
    const p = new DirtyPerson({ name: "Alice", age: 25 });
    p._writeAttribute("name", "Bob");
    p._writeAttribute("age", 30);
    p.restoreAttributes();
    expect(p._readAttribute("name")).toBe("Alice");
    expect(p._readAttribute("age")).toBe(25);
    expect(p.isChanged).toBe(false);
  });

  it("resetting attribute", () => {
    const p = new DirtyPerson({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    expect(p.isChanged).toBe(true);
    p._writeAttribute("name", "Alice");
    expect(p.isChanged).toBe(false);
  });
  it("attribute mutation", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.isChanged).toBe(false);
    p._writeAttribute("name", "Bob");
    expect(p.isChanged).toBe(true);
    expect(p.changes).toEqual({ name: ["Alice", "Bob"] });
  });

  it("using attribute_will_change! with a symbol", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    p._writeAttribute("name", "Bob");
    expect(p.attributeChanged("name")).toBe(true);
    expect(p.attributeWas("name")).toBe("Alice");
  });
});
