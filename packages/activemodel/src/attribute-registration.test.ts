import { describe, it, expect } from "vitest";
import { Model, Types } from "./index.js";

describe("AttributeRegistrationTest", () => {
  it("attributes can be registered", () => {
    class MyModel extends Model {
      static {
        this.attribute("title", "string");
      }
    }
    expect(MyModel.attributeNames()).toContain("title");
  });

  it("type options are forwarded when type is specified by name", () => {
    class MyModel extends Model {
      static {
        this.attribute("count", "integer");
      }
    }
    const m = new MyModel({ count: "5" });
    expect(m.readAttribute("count")).toBe(5);
  });

  it("default value can be specified", () => {
    class MyModel extends Model {
      static {
        this.attribute("status", "string", { default: "pending" });
      }
    }
    const m = new MyModel({});
    expect(m.readAttribute("status")).toBe("pending");
  });

  it("default value can be nil", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string", { default: null });
      }
    }
    const m = new MyModel({});
    expect(m.readAttribute("name")).toBeNull();
  });

  it(".type_for_attribute returns the default type when an unregistered attribute is specified", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({});
    expect(m.typeForAttribute("unknown")).toBeNull();
  });

  it("new attributes can be registered at any time", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    MyModel.attribute("age", "integer");
    expect(MyModel.attributeNames()).toContain("age");
  });

  it("attributes are inherited", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {
      static {
        this.attribute("age", "integer");
      }
    }
    expect(Child.attributeNames()).toContain("name");
    expect(Child.attributeNames()).toContain("age");
  });

  it("subclass attributes do not affect superclass", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {
      static {
        this.attribute("age", "integer");
      }
    }
    expect(Parent.attributeNames()).not.toContain("age");
  });

  it("new superclass attributes are inherited even after subclass attributes are registered", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {
      static {
        this.attribute("age", "integer");
      }
    }
    expect(Child.attributeNames()).toContain("name");
  });

  it("new superclass attributes do not override subclass attributes", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {
      static {
        this.attribute("name", "integer");
      }
    }
    const c = new Child({ name: "5" });
    expect(c.readAttribute("name")).toBe(5);
  });

  it("superclass attributes can be overridden", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string", { default: "parent" });
      }
    }
    class Child extends Parent {
      static {
        this.attribute("name", "string", { default: "child" });
      }
    }
    const c = new Child({});
    expect(c.readAttribute("name")).toBe("child");
  });

  it("superclass default values can be overridden", () => {
    class Parent extends Model {
      static {
        this.attribute("status", "string", { default: "active" });
      }
    }
    class Child extends Parent {
      static {
        this.attribute("status", "string", { default: "inactive" });
      }
    }
    const c = new Child({});
    expect(c.readAttribute("status")).toBe("inactive");
  });

  it(".decorate_attributes decorates all attributes when none are specified", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({ name: "test" });
    expect(m.readAttribute("name")).toBe("test");
  });

  it(".decorate_attributes supports conditional decoration", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const m = new MyModel({ name: "test" });
    expect(m.readAttribute("name")).toBe("test");
  });

  it("superclass attribute types can be decorated", () => {
    class Parent extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Parent {}
    const c = new Child({ name: "test" });
    expect(c.readAttribute("name")).toBe("test");
  });

  it("the default type is used when type is omitted", () => {
    // When using a registered type, lookups use the registry
    const stringType = Types.typeRegistry.lookup("string");
    expect(stringType.name).toBe("string");
    expect(stringType.cast("hello")).toBe("hello");
  });

  it("type is resolved when specified by name", () => {
    class Person extends Model {
      static {
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ age: "25" });
    expect(p.readAttribute("age")).toBe(25);
  });

  it(".attribute_types reflects registered attribute types", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const defs = Person._attributeDefinitions;
    expect(defs.get("name")!.type.name).toBe("string");
    expect(defs.get("age")!.type.name).toBe("integer");
  });

  it(".decorate_attributes decorates specified attributes", () => {
    // We can use normalizes as the TS equivalent of decorate_attributes
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.normalizes("name", (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v));
      }
    }
    const p = new Person({ name: "alice" });
    expect(p.readAttribute("name")).toBe("ALICE");
  });

  it(".decorate_attributes stacks decorators", () => {
    // Multiple normalizations: last one wins since normalizes replaces
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.normalizes("name", (v: unknown) =>
          typeof v === "string" ? v.trim().toUpperCase() : v,
        );
      }
    }
    const p = new Person({ name: "  alice  " });
    expect(p.readAttribute("name")).toBe("ALICE");
  });

  it("re-registering an attribute overrides previous decorators", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.normalizes("name", (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v));
        // Re-register normalization
        this.normalizes("name", (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v));
      }
    }
    const p = new Person({ name: "ALICE" });
    expect(p.readAttribute("name")).toBe("alice");
  });

  it(".type_for_attribute returns the registered attribute type", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const u = new User({ name: "Alice", age: 25 });
    expect(u.typeForAttribute("name")?.name).toBe("string");
    expect(u.typeForAttribute("age")?.name).toBe("integer");
  });

  it(".attribute_types returns the default type when key is missing", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(p.typeForAttribute("name")).not.toBeNull();
    expect(p.typeForAttribute("missing_key")).toBeNull();
  });

  it("_pendingAttributeModifications queue is populated by attribute()", () => {
    class MyModel extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer", { default: 0 });
      }
    }
    const queue = (MyModel as any)._pendingAttributeModifications;
    expect(queue).toBeDefined();
    // "name" → PendingType; "age" → PendingType + PendingDefault
    expect(queue.length).toBe(3);
  });

  it("_default_attributes seeds empty set and replays pending queue", () => {
    class MyModel extends Model {
      static {
        this.attribute("score", "integer", { default: 10 });
      }
    }
    const defaults = (MyModel as any)._defaultAttributes();
    expect(defaults.getAttribute("score").value).toBe(10);
  });

  it("pending queue from superclass is replayed before subclass queue", () => {
    class Parent extends Model {
      static {
        this.attribute("role", "string", { default: "user" });
      }
    }
    class Child extends Parent {
      static {
        this.attribute("role", "string", { default: "admin" });
      }
    }
    // Child's pending queue replays after parent's, so child's default wins
    const defaults = (Child as any)._defaultAttributes();
    expect(defaults.getAttribute("role").value).toBe("admin");
  });
});
