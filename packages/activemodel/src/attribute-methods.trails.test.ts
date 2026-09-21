/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, expect, it } from "vitest";

import {
  type AttributeMethod,
  InstanceMethods,
  defineMethodAttribute,
} from "./attribute-methods.js";
import { Model } from "./index.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

describe("AttributeMethodsTest (trails)", () => {
  it("generating alias attribute methods clears the attribute method patterns cache", () => {
    class Person extends Model {
      declare name: string;
      declare static attributeMethodPatternsCache: AttributesClassHalf["attributeMethodPatternsCache"];
      declare static attributeMethodPatternsMatching: AttributesClassHalf["attributeMethodPatternsMatching"];
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeAliases: AttributesClassHalf["attributeAliases"];
      declare static attributeMethodPatterns: AttributesClassHalf["attributeMethodPatterns"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    Person.attributeMethodSuffix("Short");
    Person.attributeMethodPatternsMatching("nameShort");
    expect(Person.attributeMethodPatternsCache().size).toBeGreaterThan(0);

    Person.aliasAttribute("nickname", "name");

    expect(Person.attributeMethodPatternsCache().size).toBe(0);
  });

  it("alias attribute overrides a method inherited from a parent class", () => {
    class Person extends Model {
      declare name: string;
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attributeMethodSuffix("Short");
      }
      attributeShort(attrName: string): string {
        return String(this._readAttribute(attrName)).slice(0, 3);
      }
      nicknameShort(): string {
        return "parent";
      }
    }
    interface Person extends Attributes {}

    class Employee extends Person {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attributeAliases: AttributesClassHalf["attributeAliases"];
      declare static attributeMethodPatterns: AttributesClassHalf["attributeMethodPatterns"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        this.aliasAttribute("nickname", "name");
      }
    }

    expect(new Person({ name: "Alexander" }).nicknameShort()).toBe("parent");
    expect(new Employee({ name: "Alexander" }).nicknameShort()).toBe("Ale");
  });

  it("the bare pattern generates the reader through the define_method_attribute hook", () => {
    const seen: string[] = [];
    class Person extends Model {
      declare name: string;
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
      }
      static defineMethodAttribute = function (
        this: unknown,
        canonicalName: string,
        options: Parameters<typeof defineMethodAttribute>[1],
      ) {
        seen.push(canonicalName);
        return defineMethodAttribute.call(this, canonicalName, options);
      };
      static {
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    expect(seen).toEqual(["name"]);
    expect(Object.getOwnPropertyDescriptor(Person.prototype, "name")).toBeUndefined();
    const person = new Person({ name: "Alexander" });
    expect(person.name).toBe("Alexander");
    person.name = "Bob";
    expect(person._readAttribute("name")).toBe("Bob");
  });

  it("alias_attribute and attribute_method_suffix write only the declaring class", () => {
    class Person extends Model {
      declare name: string;
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeAliases: AttributesClassHalf["attributeAliases"];
      declare static attributeMethodPatterns: AttributesClassHalf["attributeMethodPatterns"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    class Employee extends Person {
      declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
      declare static attributeAliases: AttributesClassHalf["attributeAliases"];
      declare static attributeMethodPatterns: AttributesClassHalf["attributeMethodPatterns"];
      declare static attributeMethodSuffix: AttributesClassHalf["attributeMethodSuffix"];

      static {
        this.aliasAttribute("nickname", "name");
        this.attributeMethodSuffix("Short");
      }
    }

    expect(Employee.attributeAliases).toEqual({ nickname: "name" });
    expect(Person.attributeAliases).toEqual({});
    expect(Employee.attributeMethodPatterns.length).toBe(Person.attributeMethodPatterns.length + 1);
  });

  it("_read_attribute raises for a name with no reader, as __send__ does", () => {
    class Person extends Model {
      declare name: string;
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const person = new Person({ name: "Alexander" });

    expect(person._readAttribute("name")).toBe("Alexander");
    expect(() => person._readAttribute("nope")).toThrow(
      /undefined method 'nope' for an instance of Person/,
    );
  });

  it("reads an attribute through method_missing after undefine_attribute_methods", () => {
    class Person extends Model {
      declare name: string;
      declare static attribute: AttributesClassHalf["attribute"];
      declare static undefineAttributeMethods: AttributesClassHalf["undefineAttributeMethods"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const person = new Person({ name: "Alexander" });
    Person.undefineAttributeMethods();

    expect(person.methodMissing("name")).toBe("Alexander");
    expect(person._readAttribute("name")).toBe("Alexander");
    expect(person.respondTo("name")).toBe(true);
  });

  it("assigns through a generated writer when the class body defines the reader", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }

      get name(): string {
        return `OVERRIDE:${this.attribute("name") as string}`;
      }
    }
    interface Person extends Attributes {}

    const person = new Person();
    (person as { name: unknown }).name = "Alexander";

    expect(person.attribute("name")).toBe("Alexander");
    expect(person.name).toBe("OVERRIDE:Alexander");
  });
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
