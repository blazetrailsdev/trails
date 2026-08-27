/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, expect, it } from "vitest";

import { defineMethodAttribute } from "./attribute-methods.js";
import { Model } from "./index.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

describe("AttributeMethodsTest (trails)", () => {
  it("generating alias attribute methods clears the attribute method patterns cache", () => {
    class Person extends Model {
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
});
