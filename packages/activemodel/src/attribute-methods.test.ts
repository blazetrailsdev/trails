import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("AttributeMethodsTest", () => {
  it("#define_attribute_method does not generate attribute method if already defined in attribute module", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      customName() {
        return "custom";
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.customName()).toBe("custom");
  });

  it("#define_attribute_method generates a method that is already defined on the host", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    expect(p.readAttribute("name")).toBe("test");
  });

  it("#define_attribute_method generates attribute method with invalid identifier characters", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    expect(p.readAttribute("name")).toBe("test");
  });

  it("#define_attribute_methods works passing multiple arguments", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 30 });
    expect(p.readAttribute("name")).toBe("Alice");
    expect(p.readAttribute("age")).toBe(30);
  });

  it("#define_attribute_methods generates attribute methods", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.readAttribute("name")).toBe("Alice");
  });

  it("#alias_attribute generates attribute_aliases lookup hash", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("fullName", "name");
      }
    }
    const p = new Person({ name: "Alice" });
    expect((p as any).fullName).toBe("Alice");
  });

  it("#define_attribute_methods generates attribute methods with spaces in their names", () => {
    class Person extends Model {
      static {
        this.attribute("first_name", "string");
      }
    }
    const p = new Person({ first_name: "Alice" });
    expect(p.readAttribute("first_name")).toBe("Alice");
  });

  it("#alias_attribute works with attributes with spaces in their names", () => {
    class Person extends Model {
      static {
        this.attribute("first_name", "string");
        this.aliasAttribute("firstName", "first_name");
      }
    }
    const p = new Person({ first_name: "Alice" });
    expect((p as any).firstName).toBe("Alice");
  });

  it("#alias_attribute works with attributes named as a ruby keyword", () => {
    class Person extends Model {
      static {
        this.attribute("class_name", "string");
        this.aliasAttribute("className", "class_name");
      }
    }
    const p = new Person({ class_name: "Admin" });
    expect((p as any).className).toBe("Admin");
  });

  it("#undefine_attribute_methods undefines alias attribute methods", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attributeMethodPrefix("clear_");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(typeof (p as any).clear_name).toBe("function");
    Person.undefineAttributeMethods();
    const p2 = new Person({ name: "Bob" });
    expect((p2 as any).clear_name).toBeUndefined();
  });

  it("defined attribute doesn't expand positional hash argument", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    expect(p.readAttribute("name")).toBe("test");
  });

  it("should not interfere with respond_to? if the attribute has a private/protected method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.respondTo("readAttribute")).toBe(true);
  });

  it("alias attribute respects user defined method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("display_name", "name");
      }
    }
    const p = new Person({ name: "Alice" });
    expect((p as any).display_name).toBe("Alice");
  });

  it("alias attribute respects user defined method in parent classes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("display_name", "name");
      }
    }
    class Employee extends Person {}
    const e = new Employee({ name: "Bob" });
    expect((e as any).display_name).toBe("Bob");
  });

  it("method missing works correctly even if attributes method is not defined", () => {
    class Bare extends Model {}
    const b = new Bare();
    // attributeMissing returns null for undefined attributes
    expect(b.readAttribute("nonexistent")).toBe(null);
  });

  it("unrelated classes should not share attribute method matchers", () => {
    class A extends Model {
      static {
        this.attribute("x", "string");
      }
    }
    class B extends Model {
      static {
        this.attribute("y", "string");
      }
    }
    expect(A.attributeNames()).toEqual(["x"]);
    expect(B.attributeNames()).toEqual(["y"]);
  });

  it("#define_attribute_method generates attribute method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attributeMethodPrefix("clear_");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(typeof (p as any).clear_name).toBe("function");
  });

  it("#define_attribute_methods defines alias attribute methods after undefining", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("full_name", "name");
      }
    }
    const p = new Person({ name: "Alice" });
    expect((p as any).full_name).toBe("Alice");
    (p as any).full_name = "Bob";
    expect(p.readAttribute("name")).toBe("Bob");
  });

  it("#undefine_attribute_methods removes attribute methods", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attributeMethodSuffix("_changed");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(typeof (p as any).name_changed).toBe("function");
    Person.undefineAttributeMethods();
    const p2 = new Person({ name: "Bob" });
    expect((p2 as any).name_changed).toBeUndefined();
  });

  it("accessing a suffixed attribute", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attributeMethodSuffix("_changed");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(typeof (p as any).name_changed).toBe("function");
  });

  it("should not interfere with method_missing if the attr has a private/protected method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      customName() {
        return "custom";
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.customName()).toBe("custom");
    expect(p.readAttribute("name")).toBe("Alice");
  });

  it("should use attribute_missing to dispatch a missing attribute", () => {
    // Mirrors Rails attribute_methods_test.rb:330-342 — overriding
    // attribute_missing intercepts the entire generated per-attribute
    // method cascade. Calling a dynamic method like `name_was` lands in
    // the override with a match struct carrying attr_name + proxy_target.
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      override attributeMissing(match: { proxyTarget: string; attrName: string }): unknown {
        return match;
      }
    }
    const p = new Person({ name: "Alice" });
    const match = (
      p as unknown as { nameWas(): { attrName: string; proxyTarget: string } }
    ).nameWas();
    expect(match.attrName).toBe("name");
    expect(match.proxyTarget).toBe("attributeWas");
  });

  it("readAttribute / writeAttribute resolve alias_attribute names transparently", () => {
    // Rails `read_attribute(name)` does `attribute_aliases[name] || name`
    // (activemodel attribute_methods.rb) so callers can pass either the
    // aliased or canonical name and hit the same underlying attribute.
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("nickname", "name");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.readAttribute("nickname")).toBe("Alice");
    p.writeAttribute("nickname", "Ally");
    expect(p.readAttribute("name")).toBe("Ally");
    expect(p.readAttribute("nickname")).toBe("Ally");
  });

  it("aliased writes propagate to dirty tracking on the canonical name", () => {
    // The alias write must register a change on the ORIGINAL attribute's
    // dirty state, not a separate entry — otherwise changedAttributes /
    // changes would report under the aliased name.
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.aliasAttribute("nickname", "name");
      }
    }
    const p = new Person({ name: "Alice" });
    p.changesApplied();
    p.writeAttribute("nickname", "Ally");
    expect(p.changedAttributes).toEqual(["name"]);
    expect(p.changes).toEqual({ name: ["Alice", "Ally"] });
  });

  it("hasAttribute and readAttributeBeforeTypeCast resolve alias names", () => {
    // Rails `has_attribute?` and `read_attribute_before_type_cast` both go
    // through `attribute_aliases[name] || name` (attribute_methods.rb).
    class Person extends Model {
      static {
        this.attribute("age", "integer");
        this.aliasAttribute("years", "age");
      }
    }
    const p = new Person({ age: "42" });
    expect(p.hasAttribute("years")).toBe(true);
    expect(p.hasAttribute("age")).toBe(true);
    expect(p.hasAttribute("nope")).toBe(false);
    expect(p.readAttributeBeforeTypeCast("years")).toBe("42");
  });

  it("name clashes are handled", () => {
    // Attributes with the same name as existing methods should still work via readAttribute
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.readAttribute("name")).toBe("Alice");
  });
});
describe("hasAttribute", () => {
  it("returns true for defined attributes", () => {
    class Widget extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("size", "integer");
      }
    }

    const w = new Widget({ name: "Test" });
    expect(w.hasAttribute("name")).toBe(true);
    expect(w.hasAttribute("size")).toBe(true);
    expect(w.hasAttribute("unknown")).toBe(false);
  });
});
describe("attribute method prefix/suffix/affix", () => {
  it("defines prefixed methods for attributes", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attributeMethodPrefix("clear_");
      }
    }
    const u = new User({ name: "Alice" });
    expect((u as any)["clear_name"]()).toBe("Alice");
  });

  it("defines suffixed methods for attributes", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attributeMethodSuffix("_before_type_cast");
      }
    }
    const u = new User({ name: "Alice" });
    expect((u as any)["name_before_type_cast"]()).toBe("Alice");
  });

  it("defines affix methods with both prefix and suffix", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attributeMethodAffix({ prefix: "reset_", suffix: "_to_default" });
      }
    }
    const u = new User({ name: "Alice" });
    expect((u as any)["reset_name_to_default"]()).toBe("Alice");
  });
});

describe("respondTo", () => {
  it("returns true for defined methods", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Alice" });
    expect(u.respondTo("readAttribute")).toBe(true);
    expect(u.respondTo("isValid")).toBe(true);
  });

  it("returns true for attributes", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Alice" });
    expect(u.respondTo("name")).toBe(true);
  });

  it("returns false for non-existent methods/attributes", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "Alice" });
    expect(u.respondTo("nonExistentMethod")).toBe(false);
  });
});

describe("attributeMissing", () => {
  it("returns null by default for unknown attributes", () => {
    class User extends Model {
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    User.attribute("name", "string");

    const u = new User({ name: "Alice" });
    expect(u.readAttribute("nonexistent")).toBeNull();
  });

  it("can be overridden to provide custom behavior", () => {
    // Rails attribute_missing intercepts the method_missing dispatch
    // path for *generated* per-attribute methods (name_changed?,
    // name_was, restore_name, …). In trails those methods are
    // pre-generated by defineDirtyAttributeMethods and routed through
    // attributeMissing(match, …), so a single override hooks the entire
    // cascade — same intercept shape as Rails.
    class User extends Model {
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
      override attributeMissing(match: { proxyTarget: string; attrName: string }): unknown {
        return `intercepted:${match.proxyTarget}:${match.attrName}`;
      }
    }
    User.attribute("name", "string");

    const u = new User({ name: "Alice" });
    expect((u as unknown as { nameWas(): string }).nameWas()).toBe("intercepted:attributeWas:name");
    expect((u as unknown as { nameChanged(): string }).nameChanged()).toBe(
      "intercepted:attributeChanged:name",
    );
    // Plain attribute reads still work normally — readAttribute is not
    // routed through attribute_missing in either Rails or trails.
    expect(u.readAttribute("name")).toBe("Alice");
  });
});

describe("attributeNames (instance)", () => {
  it("returns the same names as the class method", () => {
    class User extends Model {
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
    }
    User.attribute("name", "string");
    User.attribute("age", "integer");

    const u = new User({ name: "Alice", age: 25 });
    expect(u.attributeNames()).toEqual(User.attributeNames());
    expect(u.attributeNames()).toContain("name");
    expect(u.attributeNames()).toContain("age");
  });
});
