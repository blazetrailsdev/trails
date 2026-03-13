import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("AttributeTest", () => {
    it("reading memoizes falsy values", () => {
      class MyModel extends Model {
        static {
          this.attribute("count", "integer", { default: 0 });
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("count")).toBe(0);
      expect(m.readAttribute("count")).toBe(0);
    });

    it("from_user + value_for_database type casts from the user to the database", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({ age: "25" });
      expect(m.readAttribute("age")).toBe(25);
    });

    it("from_user + value_for_database uses serialize_cast_value when possible", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({ age: "25" });
      expect(m.readAttribute("age")).toBe(25);
    });

    it("value_for_database is memoized", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.readAttribute("name")).toBe("test");
      expect(m.readAttribute("name")).toBe("test");
    });

    it("value_for_database is recomputed when value changes in place", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.readAttribute("name")).toBe("changed");
    });

    it("duping does not dup the value if it is not dupable", () => {
      class MyModel extends Model {
        static {
          this.attribute("count", "integer");
        }
      }
      const m = new MyModel({ count: 5 });
      expect(m.readAttribute("count")).toBe(5);
    });

    it("duping does not eagerly type cast if we have not yet type cast", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("name")).toBeNull();
    });

    it("uninitialized attributes yield their name if a block is given to value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({});
      expect(m.readAttribute("name")).toBeNull();
    });

    it("attributes do not equal attributes with different names", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
          this.attribute("title", "string");
        }
      }
      const m = new MyModel({ name: "test", title: "test" });
      expect(m.readAttribute("name")).toBe("test");
      expect(m.readAttribute("title")).toBe("test");
    });

    it("attributes do not equal attributes with different types", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ age: 25, name: "25" });
      expect(m.readAttribute("age")).toBe(25);
      expect(m.readAttribute("name")).toBe("25");
    });

    it("attributes do not equal attributes with different values", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m1 = new MyModel({ name: "Alice" });
      const m2 = new MyModel({ name: "Bob" });
      expect(m1.readAttribute("name")).not.toBe(m2.readAttribute("name"));
    });

    it("attributes do not equal attributes of other classes", () => {
      class ModelA extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      class ModelB extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new ModelA({ name: "test" });
      const b = new ModelB({ name: "test" });
      expect(a.constructor).not.toBe(b.constructor);
    });

    it("an attribute has been read when its value is calculated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.readAttribute("name")).toBe("test");
    });

    it("an attribute is not changed if it hasn't been assigned or mutated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute is changed if it's been assigned a new value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.attributeChanged("name")).toBe(true);
    });

    it("an attribute is not changed if it's assigned the same value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "test");
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute cannot be mutated if it has not been read, and skips expensive calculations", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("an attribute is changed if it has been mutated", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "mutated");
      expect(m.attributeChanged("name")).toBe(true);
    });

    it("an attribute can forget its changes", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.writeAttribute("name", "changed");
      expect(m.attributeChanged("name")).toBe(true);
      m.clearChangesInformation();
      expect(m.attributeChanged("name")).toBe(false);
    });

    it("#forgetting_assignment on an unchanged .from_database attribute re-deserializes its value", () => {
      class MyModel extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const m = new MyModel({ name: "test" });
      m.clearChangesInformation();
      expect(m.readAttribute("name")).toBe("test");
    });

    it("with_value_from_user validates the value", () => {
      class MyModel extends Model {
        static {
          this.attribute("age", "integer");
        }
      }
      const m = new MyModel({});
      m.writeAttribute("age", "25");
      expect(m.readAttribute("age")).toBe(25);
    });
  });
});
