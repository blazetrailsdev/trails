import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
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
  });
});
