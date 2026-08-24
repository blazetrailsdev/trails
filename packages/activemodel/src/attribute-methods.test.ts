import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import {
  defineAttributeMethod,
  generatedAttributeMethods,
  missingAttribute,
} from "./attribute-methods.js";

describe("AttributeMethodsTest", () => {
  it("#missing_attribute applies the supplied stack to the raised error", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    const stack = "custom backtrace line";
    const call = () =>
      (missingAttribute as (this: unknown, attrName: string, stack?: string) => never).call(
        p,
        "title",
        stack,
      );
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
      static {
        this.attribute("name", "string");
      }
    }
    // Rails defines `foo` straight into the module and then generates the bare
    // `foo` reader over it. trails skips the bare pattern (readers are real
    // accessor properties), so a suffix pattern's method stands in for it.
    Person.attributeMethodSuffix("Short");
    generatedAttributeMethods.call(Person).moduleEval((mod) => {
      Object.defineProperty(mod, "nameShort", {
        value: () => "<3",
        writable: true,
        configurable: true,
      });
    });
    defineAttributeMethod.call(Person, "name");

    expect((new Person({ name: "Alice" }) as unknown as { nameShort(): string }).nameShort()).toBe(
      "<3",
    );
  });

  it("#define_attribute_method generates a method that is already defined on the host", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    expect(p._readAttribute("name")).toBe("test");
  });

  it("#define_attribute_method generates attribute method with invalid identifier characters", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "test" });
    expect(p._readAttribute("name")).toBe("test");
  });

  it("#define_attribute_methods works passing multiple arguments", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({ name: "Alice", age: 30 });
    expect(p._readAttribute("name")).toBe("Alice");
    expect(p._readAttribute("age")).toBe(30);
  });

  it("#define_attribute_methods generates attribute methods", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p._readAttribute("name")).toBe("Alice");
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
    expect(Person.attributeAliases).toEqual({ fullName: "name" });
  });

  it("#define_attribute_methods generates attribute methods with spaces in their names", () => {
    class Person extends Model {
      static {
        this.attribute("first_name", "string");
      }
    }
    const p = new Person({ first_name: "Alice" });
    expect(p._readAttribute("first_name")).toBe("Alice");
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
    expect(p._readAttribute("name")).toBe("test");
  });

  it("should not interfere with respond_to? if the attribute has a private/protected method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.respondTo("_readAttribute")).toBe(true);
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
    expect(b.attribute("nonexistent")).toBe(null);
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
    A.attributeMethodPrefix("clear_");
    expect(A.attributeMethodPatterns).not.toEqual(B.attributeMethodPatterns);
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
    expect(p._readAttribute("name")).toBe("Bob");
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
    expect(p._readAttribute("name")).toBe("Alice");
  });

  it("should use attribute_missing to dispatch a missing attribute", () => {
    // Mirrors Rails attribute_methods_test.rb:330-342. `ModelWithAttributes2`
    // never runs `define_attribute_methods`, so `foo_test` is undefined and
    // Ruby routes it through `method_missing` → `attribute_missing`. trails
    // generates the method eagerly (no `method_missing`), so the equivalent
    // route is a pattern whose proxy target the class does not answer.
    class ModelWithAttributes2 extends Model {
      static {
        this.attributeMethodSuffix("Test");
        this.attribute("foo", "string");
      }
      override attributeMissing(match: { proxyTarget: string; attrName: string }): unknown {
        return match;
      }
    }
    const m = new ModelWithAttributes2({ foo: "bar" });
    const match = (
      m as unknown as { fooTest(): { attrName: string; proxyTarget: string } }
    ).fooTest();
    expect(match.attrName).toBe("foo");
    expect(match.proxyTarget).toBe("attributeTest");
  });

  it("name clashes are handled", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p._readAttribute("name")).toBe("Alice");
  });
});
describe("attribute method prefix/suffix/affix", () => {
  it("defines prefixed methods for attributes", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
        this.attributeMethodPrefix("clear_");
      }
      clear_attribute(attr: string): unknown {
        return this._readAttribute(attr);
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
      attribute_before_type_cast(attr: string): unknown {
        return this._readAttribute(attr);
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
      reset_attribute_to_default(attr: string): unknown {
        return this._readAttribute(attr);
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
    expect(u.respondTo("_readAttribute")).toBe(true);
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
    expect(u.attribute("nonexistent")).toBeNull();
  });

  it("can be overridden to provide custom behavior", () => {
    // Rails attribute_missing intercepts the method_missing dispatch
    // path for *generated* per-attribute methods (name_changed?,
    // name_was, restore_name, …), every one of which has a proxy target the
    // class answers, so it is sent directly. attribute_missing is the
    // method_missing arm: it catches a pattern whose proxy target is absent.
    class User extends Model {
      constructor(attrs: Record<string, unknown> = {}) {
        super(attrs);
      }
      override attributeMissing(match: { proxyTarget: string; attrName: string }): unknown {
        return `intercepted:${match.proxyTarget}:${match.attrName}`;
      }
    }
    User.attributeMethodSuffix("Contrived");
    User.attribute("name", "string");

    const u = new User({ name: "Alice" });
    expect((u as unknown as { nameContrived(): string }).nameContrived()).toBe(
      "intercepted:attributeContrived:name",
    );
    // Plain attribute reads still work normally — readAttribute is not
    // routed through attribute_missing in either Rails or trails.
    expect(u._readAttribute("name")).toBe("Alice");
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
