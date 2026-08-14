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
});
