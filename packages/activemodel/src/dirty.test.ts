import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("DirtyTest", () => {
    it("changes accessible through both strings and symbols", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changes["name"]).toEqual(["Alice", "Bob"]);
    });

    it("be consistent with symbols arguments after the changes are applied", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.previousChanges["name"]).toEqual(["Alice", "Bob"]);
      expect(p.changed).toBe(false);
    });

    it("restore_attributes can restore only some attributes", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("age", "integer");
        }
      }
      const p = new Person({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      p.writeAttribute("age", 30);
      p.clearAttributeChanges(["name"]);
      expect(p.attributeChanged("name")).toBe(false);
      expect(p.attributeChanged("age")).toBe(true);
    });
  });

  describe("Dirty (ported)", () => {
    class DirtyPerson extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("color", "string");
      }
    }

    it("setting attribute will result in change", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
    });

    it("list of changed attribute keys", () => {
      const p = new DirtyPerson({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      expect(p.changedAttributes).toContain("name");
      expect(p.changedAttributes).not.toContain("age");
    });

    it("changes to attribute values", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.attributeChange("name")).toEqual(["Alice", "Bob"]);
    });

    it("checking if an attribute has changed to a particular value", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.attributeChanged("name", { to: "Bob" })).toBe(true);
      expect(p.attributeChanged("name", { to: "Charlie" })).toBe(false);
    });

    it("setting color to same value should not result in change being recorded", () => {
      const p = new DirtyPerson({ color: "red" });
      p.writeAttribute("color", "red");
      expect(p.changed).toBe(false);
    });

    it("saving should reset model's changed status", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
      p.changesApplied();
      expect(p.changed).toBe(false);
    });

    it("saving should preserve previous changes", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
    });

    it("setting new attributes should not affect previous changes", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      p.writeAttribute("name", "Charlie");
      expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
    });

    it("saving should preserve model's previous changed status", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.attributePreviouslyChanged("name")).toBe(true);
    });

    it("checking if an attribute was previously changed to a particular value", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      expect(p.attributePreviouslyChanged("name", { from: "Alice", to: "Bob" })).toBe(true);
      expect(p.attributePreviouslyChanged("name", { to: "Charlie" })).toBe(false);
    });

    it("previous value is preserved when changed after save", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      p.writeAttribute("name", "Charlie");
      expect(p.previousChanges).toEqual({ name: ["Alice", "Bob"] });
      expect(p.changes).toEqual({ name: ["Bob", "Charlie"] });
    });

    it("changing the same attribute multiple times retains the correct original value", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.writeAttribute("name", "Charlie");
      expect(p.attributeChange("name")).toEqual(["Alice", "Charlie"]);
    });

    it("clear_changes_information should reset all changes", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      p.writeAttribute("name", "Charlie");
      p.clearChangesInformation();
      expect(p.changed).toBe(false);
      expect(Object.keys(p.previousChanges).length).toBe(0);
    });

    it("restore_attributes should restore all previous data", () => {
      const p = new DirtyPerson({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      p.writeAttribute("age", 30);
      p.restoreAttributes();
      expect(p.readAttribute("name")).toBe("Alice");
      expect(p.readAttribute("age")).toBe(25);
      expect(p.changed).toBe(false);
    });

    it("resetting attribute", () => {
      const p = new DirtyPerson({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
      p.writeAttribute("name", "Alice");
      expect(p.changed).toBe(false);
    });
  });

  describe("Dirty (advanced)", () => {
    it("using attribute_will_change! with a symbol", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      p.writeAttribute("name", "Bob");
      expect(p.attributeChanged("name")).toBe(true);
      expect(p.attributeWas("name")).toBe("Alice");
    });

    it("attribute mutation", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.changed).toBe(false);
      p.writeAttribute("name", "Bob");
      expect(p.changed).toBe(true);
      expect(p.changes).toEqual({ name: ["Alice", "Bob"] });
    });

    it("model can be dup-ed without Attributes", () => {
      class Bare extends Model {}
      const b = new Bare();
      // Should not throw
      expect(b.changed).toBe(false);
      expect(b.changedAttributes).toEqual([]);
    });
  });

  describe("Dirty JSON tests", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    it("to_json should work on model", () => {
      const p = new Person({ name: "Alice", age: 25 });
      const json = p.toJson();
      expect(JSON.parse(json)).toEqual({ name: "Alice", age: 25 });
    });

    it("to_json should work on model with :except string option", () => {
      const p = new Person({ name: "Alice", age: 25 });
      const json = p.toJson({ except: ["age"] });
      expect(JSON.parse(json)).toEqual({ name: "Alice" });
    });

    it("to_json should work on model with :except array option", () => {
      const p = new Person({ name: "Alice", age: 25 });
      const json = p.toJson({ except: ["name", "age"] });
      expect(JSON.parse(json)).toEqual({});
    });

    it("to_json should work on model after save", () => {
      const p = new Person({ name: "Alice", age: 25 });
      p.writeAttribute("name", "Bob");
      p.changesApplied();
      const json = p.toJson();
      expect(JSON.parse(json)).toEqual({ name: "Bob", age: 25 });
    });
  });
});
