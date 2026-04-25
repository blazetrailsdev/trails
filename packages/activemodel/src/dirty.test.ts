import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

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

  it("model can be dup-ed without Attributes", () => {
    class Bare extends Model {}
    const b = new Bare();
    // Should not throw
    expect(b.changed).toBe(false);
    expect(b.changedAttributes).toEqual([]);
  });

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
});
describe("Dirty Tracking", () => {
  class Person extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }

  it("not changed initially", () => {
    const p = new Person({ name: "dean", age: 30 });
    expect(p.changed).toBe(false);
    expect(p.changedAttributes).toEqual([]);
  });

  it("setting attribute will result in change", () => {
    const p = new Person({ name: "dean" });
    p.writeAttribute("name", "sam");
    expect(p.changed).toBe(true);
    expect(p.changedAttributes).toContain("name");
  });

  it("attributeWas returns original value", () => {
    const p = new Person({ name: "dean" });
    p.writeAttribute("name", "sam");
    expect(p.attributeWas("name")).toBe("dean");
  });

  it("changes to attribute values", () => {
    const p = new Person({ name: "dean" });
    p.writeAttribute("name", "sam");
    expect(p.attributeChange("name")).toEqual(["dean", "sam"]);
  });

  it("list of changed attribute keys", () => {
    const p = new Person({ name: "dean", age: 30 });
    p.writeAttribute("name", "sam");
    p.writeAttribute("age", 31);
    expect(p.changes).toEqual({
      name: ["dean", "sam"],
      age: [30, 31],
    });
  });

  it("setting color to same value should not result in change being recorded", () => {
    const p = new Person({ name: "dean" });
    p.writeAttribute("name", "dean");
    expect(p.changed).toBe(false);
  });

  it("resetting attribute", () => {
    const p = new Person({ name: "dean" });
    p.writeAttribute("name", "sam");
    expect(p.changed).toBe(true);
    p.writeAttribute("name", "dean");
    expect(p.changed).toBe(false);
  });

  it("changing the same attribute multiple times retains the correct original value", () => {
    const p = new Person({ name: "dean" });
    p.writeAttribute("name", "sam");
    p.writeAttribute("name", "bob");
    expect(p.attributeChange("name")).toEqual(["dean", "bob"]);
  });

  it("restore_attributes should restore all previous data", () => {
    const p = new Person({ name: "dean", age: 30 });
    p.writeAttribute("name", "sam");
    p.writeAttribute("age", 99);
    p.restoreAttributes();
    expect(p.readAttribute("name")).toBe("dean");
    expect(p.readAttribute("age")).toBe(30);
    expect(p.changed).toBe(false);
  });

  it("saving should preserve previous changes", () => {
    const p = new Person({ name: "dean" });
    p.writeAttribute("name", "sam");
    p.changesApplied();
    expect(p.changed).toBe(false);
    expect(p.previousChanges).toEqual({ name: ["dean", "sam"] });
  });

  it("setting new attributes should not affect previous changes", () => {
    const p = new Person({ name: "dean" });
    p.writeAttribute("name", "sam");
    p.changesApplied();
    p.writeAttribute("name", "bob");
    expect(p.previousChanges).toEqual({ name: ["dean", "sam"] });
    expect(p.changes).toEqual({ name: ["sam", "bob"] });
  });

  it("cast-value-aware: same cast value = no change", () => {
    class Sized extends Model {
      static {
        this.attribute("size", "integer");
      }
    }
    const s = new Sized({ size: "2" }); // cast to 2
    s.writeAttribute("size", "2.3"); // cast to 2
    expect(s.changed).toBe(false);
    s.writeAttribute("size", "5.1"); // cast to 5
    expect(s.changed).toBe(true);
  });
});
describe("attributeBeforeTypeCast", () => {
  it("returns the raw value before type casting", () => {
    class Price extends Model {
      static {
        this.attribute("amount", "integer");
      }
    }

    const price = new Price({ amount: "42" });
    expect(price.readAttribute("amount")).toBe(42); // cast to integer
    expect(price.readAttributeBeforeTypeCast("amount")).toBe("42"); // raw string
  });

  it("tracks raw values on writeAttribute", () => {
    class Price extends Model {
      static {
        this.attribute("amount", "integer");
      }
    }

    const price = new Price({ amount: 10 });
    price.writeAttribute("amount", "99");
    expect(price.readAttribute("amount")).toBe(99);
    expect(price.readAttributeBeforeTypeCast("amount")).toBe("99");
  });
});

describe("willSaveChangeToAttribute", () => {
  it("returns true when attribute has been changed", () => {
    class Widget extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("size", "integer");
      }
    }

    const w = new Widget({ name: "Test", size: 5 });
    w.changesApplied();
    w.writeAttribute("name", "Changed");
    expect(w.willSaveChangeToAttribute("name")).toBe(true);
    expect(w.willSaveChangeToAttribute("size")).toBe(false);
  });

  it("willSaveChangeToAttributeValues returns [old, new]", () => {
    class Widget extends Model {
      static {
        this.attribute("name", "string");
      }
    }

    const w = new Widget({ name: "Test" });
    w.changesApplied();
    w.writeAttribute("name", "Changed");
    expect(w.willSaveChangeToAttributeValues("name")).toEqual(["Test", "Changed"]);
  });
});

describe("attributeInDatabase / attributeBeforeLastSave / changedAttributeNamesToSave", () => {
  it("attributeInDatabase returns the pre-change value", () => {
    class Widget extends Model {
      static {
        this.attribute("name", "string");
      }
    }

    const w = new Widget({ name: "Test" });
    w.changesApplied();
    w.writeAttribute("name", "Changed");
    expect(w.attributeInDatabase("name")).toBe("Test");
  });

  it("attributeBeforeLastSave returns old value after save", () => {
    class Widget extends Model {
      static {
        this.attribute("name", "string");
      }
    }

    const w = new Widget({ name: "Original" });
    w.changesApplied();
    w.writeAttribute("name", "Updated");
    w.changesApplied();
    expect(w.attributeBeforeLastSave("name")).toBe("Original");
  });

  it("changedAttributeNamesToSave lists pending changes", () => {
    class Widget extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("size", "integer");
      }
    }

    const w = new Widget({ name: "Test", size: 5 });
    w.changesApplied();
    w.writeAttribute("name", "Changed");
    expect(w.changedAttributeNamesToSave).toContain("name");
    expect(w.changedAttributeNamesToSave).not.toContain("size");
  });
});

describe("clearChangesInformation", () => {
  it("clear_changes_information should reset all changes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    const p = new Person({ name: "Alice", age: 30 });
    p.changesApplied(); // snapshot as clean
    p.writeAttribute("name", "Bob");
    p.changesApplied(); // this makes name change a "previous change"
    expect(Object.keys(p.previousChanges).length).toBeGreaterThan(0);

    // Now make another current change
    p.writeAttribute("age", 31);
    expect(p.changed).toBe(true);

    p.clearChangesInformation();
    expect(p.changed).toBe(false);
    expect(Object.keys(p.previousChanges).length).toBe(0);
  });
});
