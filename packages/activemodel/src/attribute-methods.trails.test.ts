import { describe, expect, it } from "vitest";

import {
  attributeMethodPatternsCache,
  attributeMethodPatternsMatching,
} from "./attribute-methods.js";
import { Model } from "./index.js";

describe("AttributeMethodsTest (trails)", () => {
  it("generating alias attribute methods clears the attribute method patterns cache", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    Person.attributeMethodSuffix("Short");
    attributeMethodPatternsMatching.call(Person, "nameShort");
    expect(attributeMethodPatternsCache.call(Person).size).toBeGreaterThan(0);

    Person.aliasAttribute("nickname", "name");

    expect(attributeMethodPatternsCache.call(Person).size).toBe(0);
  });

  it("alias attribute overrides a method inherited from a parent class", () => {
    // `define_attribute_method_pattern`'s `override:` arm
    // (activemodel/attribute_methods.rb:324-331): a regular attribute method
    // leaves an already-implemented name alone, but `alias_attribute` — its only
    // `override: true` caller (activerecord/attribute_methods.rb:94) — always
    // defines.
    class Person extends Model {
      static {
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
    class Employee extends Person {
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
      static defineMethodAttribute = function (
        this: unknown,
        canonicalName: string,
        options: Parameters<typeof Model.defineMethodAttribute>[1],
      ) {
        seen.push(canonicalName);
        return Model.defineMethodAttribute.call(this, canonicalName, options);
      };
      static {
        this.attribute("name", "string");
      }
    }

    expect(seen).toEqual(["name"]);
    expect(Object.getOwnPropertyDescriptor(Person.prototype, "name")).toBeUndefined();
    const person = new Person({ name: "Alexander" });
    expect(person.name).toBe("Alexander");
    person.name = "Bob";
    expect(person._readAttribute("name")).toBe("Bob");
  });

  it("alias_attribute and attribute_method_suffix write only the declaring class", () => {
    // `attribute_aliases` and `attribute_method_patterns` are `class_attribute`s
    // (activemodel/attribute_methods.rb:70-73), whose writer is local to the
    // class: Rails' `self.attribute_aliases = attribute_aliases.merge(...)`
    // (:203) and `self.attribute_method_patterns += ...` (:141) leave every
    // ancestor — and the shared default — untouched.
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    class Employee extends Person {
      static {
        this.aliasAttribute("nickname", "name");
        this.attributeMethodSuffix("Short");
      }
    }

    expect(Employee.attributeAliases).toEqual({ nickname: "name" });
    expect(Person.attributeAliases).toEqual({});
    expect(Model.attributeAliases).toEqual({});
    expect(Employee.attributeMethodPatterns.length).toBe(Person.attributeMethodPatterns.length + 1);
    expect(Model.attributeMethodPatterns.length).toBe(Person.attributeMethodPatterns.length);
  });

  it("_read_attribute raises for a name with no reader, as __send__ does", () => {
    // Ruby's `_read_attribute` is `__send__(attr)` (attribute_methods.rb:556),
    // which raises NoMethodError for an undefined name; `method_missing`
    // (:507-514) re-raises it through `super` when nothing matched.
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const person = new Person({ name: "Alexander" });

    expect(person._readAttribute("name")).toBe("Alexander");
    expect(() => person._readAttribute("nope")).toThrow(
      /undefined method 'nope' for an instance of Person/,
    );
  });
});
