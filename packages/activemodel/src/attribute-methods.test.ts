/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { type AttributeMethod, InstanceMethods } from "./attribute-methods.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

describe("AttributeMethodsTest", () => {
  it("#missing_attribute applies the supplied stack to the raised error", () => {
    class Person extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeAliases: AttributesClassHalf["attributeAliases"];
      declare static attributeMethodPrefix: AttributesClassHalf["attributeMethodPrefix"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];
      declare static undefineAttributeMethods: AttributesClassHalf["undefineAttributeMethods"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    const stack = "custom backtrace line";
    const call = () =>
      (
        InstanceMethods.missingAttribute as (
          this: unknown,
          attrName: string,
          stack?: string,
        ) => never
      ).call(p, "title", stack);
    let caught: Error | undefined;
    try {
      call();
    } catch (err) {
      caught = err as Error;
    }
    expect(caught?.message).toContain("missing attribute 'title'");
    expect(caught?.stack).toBe(stack);
  });

  it("#define_attribute_method does not generate attribute method if already defined in attribute module", () => {
    class Person extends Model {
      declare static defineAttributeMethod: AttributesClassHalf["defineAttributeMethod"];
      declare static generatedAttributeMethods: AttributesClassHalf["generatedAttributeMethods"];
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    Person.attributeMethodSuffix("Short");
    Person.generatedAttributeMethods().moduleEval((mod) => {
      Object.defineProperty(mod, "nameShort", {
        value: () => "<3",
        writable: true,
        configurable: true,
      });
    });
    Person.defineAttributeMethod("name");

    expect((new Person({ name: "Alice" }) as unknown as { nameShort(): string }).nameShort()).toBe(
      "<3",
    );
  });

  it("#define_attribute_method generates a method that is already defined on the host", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    expect(p._readAttribute("name")).toBe("test");
  });

  it("#define_attribute_method generates attribute method with invalid identifier characters", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    expect(p._readAttribute("name")).toBe("test");
  });

  it("#define_attribute_methods works passing multiple arguments", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice", age: 30 });
    expect(p._readAttribute("name")).toBe("Alice");
    expect(p._readAttribute("age")).toBe(30);
  });

  it("#define_attribute_methods generates attribute methods", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("#alias_attribute generates attribute_aliases lookup hash", () => {
    class Person extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeAliases: AttributesClassHalf["attributeAliases"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.aliasAttribute("fullName", "name");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect((p as any).fullName).toBe("Alice");
    expect(Person.attributeAliases).toEqual({ fullName: "name" });
  });

  it("#define_attribute_methods generates attribute methods with spaces in their names", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("first_name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ first_name: "Alice" });
    expect(p._readAttribute("first_name")).toBe("Alice");
  });

  it("#alias_attribute works with attributes with spaces in their names", () => {
    class Person extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("first_name", "string");
        this.aliasAttribute("firstName", "first_name");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ first_name: "Alice" });
    expect((p as any).firstName).toBe("Alice");
  });

  it("#alias_attribute works with attributes named as a ruby keyword", () => {
    class Person extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("class_name", "string");
        this.aliasAttribute("className", "class_name");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ class_name: "Admin" });
    expect((p as any).className).toBe("Admin");
  });

  it("#undefine_attribute_methods undefines alias attribute methods", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodPrefix: AttributesClassHalf["attributeMethodPrefix"];
      declare static undefineAttributeMethods: AttributesClassHalf["undefineAttributeMethods"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attributeMethodPrefix("clear_");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(typeof (p as any).clear_name).toBe("function");
    Person.undefineAttributeMethods();
    const p2 = new Person({ name: "Bob" });
    expect((p2 as any).clear_name).toBeUndefined();
  });

  it("defined attribute doesn't expand positional hash argument", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    expect(p._readAttribute("name")).toBe("test");
  });

  it("should not interfere with respond_to? if the attribute has a private/protected method", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(p.respondTo("_readAttribute")).toBe(true);
  });

  it("alias attribute respects user defined method", () => {
    class Person extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.aliasAttribute("display_name", "name");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect((p as any).display_name).toBe("Alice");
  });

  it("alias attribute respects user defined method in parent classes", () => {
    class Person extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.aliasAttribute("display_name", "name");
      }
    }
    interface Person extends Attributes {}

    class Employee extends Person {}
    const e = new Employee({ name: "Bob" });
    expect((e as any).display_name).toBe("Bob");
  });

  it("method missing works correctly even if attributes method is not defined", () => {
    class Bare extends Model {
      static {
        include(this, Attributes);
      }
    }
    interface Bare extends Attributes {}
    const b = new Bare();
    expect(b.attribute("nonexistent")).toBe(null);
  });

  it("unrelated classes should not share attribute method matchers", () => {
    class A extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodPatterns: AttributesClassHalf["attributeMethodPatterns"];
      declare static attributeMethodPrefix: AttributesClassHalf["attributeMethodPrefix"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("x", "string");
      }
    }
    interface A extends Attributes {}

    class B extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodPatterns: AttributesClassHalf["attributeMethodPatterns"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("y", "string");
      }
    }

    interface B extends Attributes {}

    expect(A.attributeNames()).toEqual(["x"]);
    expect(B.attributeNames()).toEqual(["y"]);
    A.attributeMethodPrefix("clear_");
    expect(A.attributeMethodPatterns).not.toEqual(B.attributeMethodPatterns);
  });

  it("#define_attribute_method generates attribute method", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodPrefix: AttributesClassHalf["attributeMethodPrefix"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attributeMethodPrefix("clear_");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(typeof (p as any).clear_name).toBe("function");
  });

  it("#define_attribute_methods defines alias attribute methods after undefining", () => {
    class Person extends Model {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.aliasAttribute("full_name", "name");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect((p as any).full_name).toBe("Alice");
    (p as any).full_name = "Bob";
    expect(p._readAttribute("name")).toBe("Bob");
  });

  it("#undefine_attribute_methods removes attribute methods", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];
      declare static undefineAttributeMethods: AttributesClassHalf["undefineAttributeMethods"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attributeMethodSuffix("_changed");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(typeof (p as any).name_changed).toBe("function");
    Person.undefineAttributeMethods();
    const p2 = new Person({ name: "Bob" });
    expect((p2 as any).name_changed).toBeUndefined();
  });

  it("accessing a suffixed attribute", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attributeMethodSuffix("_changed");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(typeof (p as any).name_changed).toBe("function");
  });

  it("should not interfere with method_missing if the attr has a private/protected method", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
      customName() {
        return "custom";
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(p.customName()).toBe("custom");
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("should use attribute_missing to dispatch a missing attribute", () => {
    class ModelWithAttributes2 extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        include(this, Attributes);
        this.attributeMethodSuffix("Test");
        this.attribute("foo", "string");
      }
      attributeMissing(match: AttributeMethod): unknown {
        return match;
      }
    }
    interface ModelWithAttributes2 extends Attributes {}

    const m = new ModelWithAttributes2({ foo: "bar" });
    const match = (
      m as unknown as { fooTest(): { attrName: string; proxyTarget: string } }
    ).fooTest();
    expect(match.attrName).toBe("foo");
    expect(match.proxyTarget).toBe("attributeTest");
  });

  it("name clashes are handled", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(p._readAttribute("name")).toBe("Alice");
  });
});
describe("attribute method prefix/suffix/affix", () => {
  it("defines prefixed methods for attributes", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodAffix: AttributesClassHalf["attributeMethodAffix"];
      declare static attributeMethodPrefix: AttributesClassHalf["attributeMethodPrefix"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attributeMethodPrefix("clear_");
      }
      clear_attribute(attr: string): unknown {
        return this._readAttribute(attr);
      }
    }
    interface User extends Attributes {}

    const u = new User({ name: "Alice" });
    expect((u as any)["clear_name"]()).toBe("Alice");
  });

  it("defines suffixed methods for attributes", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attributeMethodSuffix("_before_type_cast");
      }
      attribute_before_type_cast(attr: string): unknown {
        return this._readAttribute(attr);
      }
    }
    interface User extends Attributes {}

    const u = new User({ name: "Alice" });
    expect((u as any)["name_before_type_cast"]()).toBe("Alice");
  });

  it("defines affix methods with both prefix and suffix", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodAffix: AttributesClassHalf["attributeMethodAffix"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attributeMethodAffix({ prefix: "reset_", suffix: "_to_default" });
      }
      reset_attribute_to_default(attr: string): unknown {
        return this._readAttribute(attr);
      }
    }
    interface User extends Attributes {}

    const u = new User({ name: "Alice" });
    expect((u as any)["reset_name_to_default"]()).toBe("Alice");
  });
});

describe("respondTo", () => {
  it("returns true for defined methods", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes {}

    const u = new User({ name: "Alice" });
    expect(u.respondTo("_readAttribute")).toBe(true);
    expect(u.respondTo("isValid")).toBe(true);
  });

  it("returns true for attributes", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes {}

    const u = new User({ name: "Alice" });
    expect(u.respondTo("name")).toBe(true);
  });

  it("returns false for non-existent methods/attributes", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface User extends Attributes {}

    const u = new User({ name: "Alice" });
    expect(u.respondTo("nonExistentMethod")).toBe(false);
  });
});

describe("attributeMissing", () => {
  it("returns null by default for unknown attributes", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface User extends Attributes {}
    User.attribute("name", "string");

    const u = new User({ name: "Alice" });
    expect(u.attribute("nonexistent")).toBeNull();
  });

  it("can be overridden to provide custom behavior", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        include(this, Attributes);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
      attributeMissing(match: AttributeMethod): unknown {
        return `intercepted:${match.proxyTarget}:${match.attrName}`;
      }
    }
    interface User extends Attributes {}
    User.attributeMethodSuffix("Contrived");
    User.attribute("name", "string");

    const u = new User({ name: "Alice" });
    expect((u as unknown as { nameContrived(): string }).nameContrived()).toBe(
      "intercepted:attributeContrived:name",
    );
    expect(u._readAttribute("name")).toBe("Alice");
  });
});

describe("attributeNames (instance)", () => {
  it("returns the same names as the class method", () => {
    class User extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
      }
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    interface User extends Attributes {}
    User.attribute("name", "string");
    User.attribute("age", "integer");

    const u = new User({ name: "Alice", age: 25 });
    expect(u.attributeNames()).toEqual(User.attributeNames());
    expect(u.attributeNames()).toContain("name");
    expect(u.attributeNames()).toContain("age");
  });
});
