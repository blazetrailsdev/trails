import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import {
  defineAttributeMethods,
  isAttributeMethodsGenerated,
  ClassMethods,
} from "../attribute-methods.js";
import { defineMethodAttribute } from "./read.js";
import { setDefineMethodAttribute } from "./write.js";
import { AttributeMethods as AMAttributeMethods } from "@blazetrails/activemodel";

fixtures({});

describe("ReadTest", () => {
  function buildKlass() {
    class Klass {
      static _primaryKey = null;
      static _attributeMethodsGenerated = false;
      static _schemaLoaded = true;
      static attributeMethodPatterns = Base.attributeMethodPatterns;
      static attributeAliases = {};
      static _aliasesByAttributeName = new Map<string, string[]>();
      static defineAttributeMethods = defineAttributeMethods;
      static defineMethodAttribute = defineMethodAttribute;
      static setDefineMethodAttribute = setDefineMethodAttribute;
      static attributeMethodsGenerated = isAttributeMethodsGenerated;
      static attributeNames = () => ["one", "two", "three"];
      static hasAttribute = Base.hasAttribute;
      static _hasAttribute = ClassMethods._hasAttribute;
      static attributeTypes = () => ({});
      static aliasAttribute = Base.aliasAttribute;
      static defineAttributeMethod = Base.defineAttributeMethod;
      static defineAttributeMethodPattern =
        AMAttributeMethods.ClassMethods.defineAttributeMethodPattern;
      static generatedAttributeMethods = Base.generatedAttributeMethods;
      static isInstanceMethodAlreadyImplemented = Base.isInstanceMethodAlreadyImplemented;
      static attributeMethodPatternsCache = Base.attributeMethodPatternsCache;
      static aliasesByAttributeName = AMAttributeMethods.ClassMethods.aliasesByAttributeName;
      static generateAliasAttributeMethods = Base.generateAliasAttributeMethods;
      static defineProxyCall = Base.defineProxyCall;
      static buildMangledName = Base.buildMangledName;
      static defineCall = Base.defineCall;
    }
    return Klass;
  }

  it("define attribute methods", () => {
    const Klass = buildKlass();
    const instance = new Klass();
    const methods = (object: object): string[] => {
      const names: string[] = [];
      for (let proto = Object.getPrototypeOf(object); proto; proto = Object.getPrototypeOf(proto)) {
        names.push(...Object.getOwnPropertyNames(proto));
      }
      return names;
    };

    for (const name of Klass.attributeNames()) {
      expect(methods(instance)).not.toContain(name);
    }

    Klass.defineAttributeMethods();

    for (const name of Klass.attributeNames()) {
      expect(methods(instance)).toContain(name);
    }
  });

  it("attribute methods generated?", () => {
    const Klass = buildKlass();

    expect("one" in Klass.prototype).toBeFalsy();

    Klass.defineAttributeMethods();

    expect("one" in Klass.prototype).toBeTruthy();
  });

  it("_read_attribute returns value for existing attribute", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post({ title: "hello" });
    expect(p._readAttribute("title")).toBe("hello");
  });

  it("_read_attribute returns null for unset attribute", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post({});
    expect(p._readAttribute("title")).toBeNull();
  });

  it("_read_attribute does not apply alias resolution", () => {
    class Post extends Base {
      static {
        this.attribute("body", "string");
        this.aliasAttribute("content", "body");
      }
    }
    const p = new Post({ body: "text" });
    expect(p._readAttribute("body")).toBe("text");
    expect(p._readAttribute("content")).toBeNull();
  });
});
