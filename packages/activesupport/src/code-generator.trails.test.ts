import { describe, expect, it } from "vitest";

import { CodeGenerator } from "./code-generator.js";
import { include } from "@blazetrails/ruby-compat/include";

describe("CodeGenerator (trails)", () => {
  it("applies the batched definitions to the owner when the batch ends", () => {
    const owner: Record<string, unknown> = {};
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
    const owner: Record<string, unknown> = {};
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

    expect(Object.hasOwn(owner, "publicName")).toBe(true);
    expect(Object.hasOwn(owner, "canonical")).toBe(false);
  });

  it("builds a body once per canonical name and reuses the cached method", () => {
    let built = 0;
    const define = (owner: Record<string, unknown>): void => {
      CodeGenerator.batch(owner, "code-generator.ts", 1, (codeGenerator) => {
        codeGenerator.defineCachedMethod("cached", { namespace: "test_cache" }, (sources) => {
          built += 1;
          sources.push((mod) => {
            mod.cached = () => "cached";
          });
        });
      });
    };

    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = {};
    define(first);
    define(second);

    expect(built).toBe(1);
    expect(Object.hasOwn(first, "cached")).toBe(true);
    expect(Object.hasOwn(second, "cached")).toBe(true);
  });

  it("yields the enclosing generator to a nested batch instead of a new one", () => {
    const owner: Record<string, unknown> = {};
    CodeGenerator.batch(owner, "code-generator.ts", 1, (outer) => {
      CodeGenerator.batch(outer, "code-generator.ts", 1, (inner) => {
        expect(inner).toBe(outer);
        inner.classEval((sources) => {
          sources.push((mod) => {
            mod.fromNestedBatch = () => true;
          });
        });
      });
      expect(Object.hasOwn(owner, "fromNestedBatch")).toBe(false);
    });

    expect(Object.hasOwn(owner, "fromNestedBatch")).toBe(true);
  });
});
