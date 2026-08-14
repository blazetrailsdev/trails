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
        return String(this.readAttribute(attrName)).slice(0, 3);
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
});
