import { describe, expect, it } from "vitest";

import { CodeGenerator } from "./code-generator.js";
import { include, Module } from "./include.js";

/**
 * Rails has no `code_generator_test.rb` — CodeGenerator is exercised through
 * `AttributeMethods`. These cover the batching contract the attribute-method
 * callers depend on: definitions land on the owner only once `execute` runs, a
 * nested batch joins the enclosing one, and a namespace's method cache is
 * consulted before a body is built a second time.
 */
describe("CodeGenerator (trails)", () => {
  it("applies the batched definitions to the owner when the batch ends", () => {
    const owner = new Module();
    class Person {}
    include(Person, owner);

    const result = CodeGenerator.batch(owner, "code-generator.ts", 1, (codeGenerator) => {
      codeGenerator.defineCachedMethod("name", { namespace: "test_apply" }, (sources) => {
        sources.push((mod) => {
          mod.name = () => "Bob";
        });
      });
      expect((new Person() as unknown as { name?: unknown }).name).toBeUndefined();
      return "returned";
    });

    expect(result).toBe("returned");
    expect((new Person() as unknown as { name: () => string }).name()).toBe("Bob");
  });

  it("defines the method under `as` while caching it under the canonical name", () => {
    const owner = new Module();
    CodeGenerator.batch(owner, "code-generator.ts", 1, (codeGenerator) => {
      codeGenerator.defineCachedMethod(
        "canonical",
        { namespace: "test_as", as: "publicName" },
        (sources) => {
          sources.push((mod) => {
            mod.canonical = () => "value";
          });
        },
      );
    });

    expect(owner.isMethodDefined("publicName")).toBe(true);
    expect(owner.isMethodDefined("canonical")).toBe(false);
  });

  it("builds a body once per canonical name and reuses the cached method", () => {
    let built = 0;
    const define = (owner: Module): void => {
      CodeGenerator.batch(owner, "code-generator.ts", 1, (codeGenerator) => {
        codeGenerator.defineCachedMethod("cached", { namespace: "test_cache" }, (sources) => {
          built += 1;
          sources.push((mod) => {
            mod.cached = () => "cached";
          });
        });
      });
    };

    const first = new Module();
    const second = new Module();
    define(first);
    define(second);

    expect(built).toBe(1);
    expect(first.isMethodDefined("cached")).toBe(true);
    expect(second.isMethodDefined("cached")).toBe(true);
  });

  it("yields the enclosing generator to a nested batch instead of a new one", () => {
    const owner = new Module();
    CodeGenerator.batch(owner, "code-generator.ts", 1, (outer) => {
      CodeGenerator.batch(outer, "code-generator.ts", 1, (inner) => {
        expect(inner).toBe(outer);
        inner.classEval((sources) => {
          sources.push((mod) => {
            mod.fromNestedBatch = () => true;
          });
        });
      });
      expect(owner.isMethodDefined("fromNestedBatch")).toBe(false);
    });

    expect(owner.isMethodDefined("fromNestedBatch")).toBe(true);
  });
});
