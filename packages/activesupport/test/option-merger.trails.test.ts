import { describe, expect, it } from "vitest";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { OptionMerger } from "../lib/option-merger.js";

describe("OptionMerger in the prototype chain", () => {
  it("is its own object and forwards through its prototype chain", () => {
    class Merger extends OptionMerger {
      #tag = "own";
      tag() {
        return this.#tag;
      }
    }
    const context = {
      greet(options: Record<string, unknown> = {}) {
        return options;
      },
    };
    const merger = new Merger(context, { a: 1 }) as Merger & { greet(o?: object): object };
    expect(merger.tag()).toBe("own");
    expect(merger).toBeInstanceOf(OptionMerger);
    expect(Object.getPrototypeOf(merger)).toBe(Merger.prototype);
    expect(Object.getPrototypeOf(new OptionMerger(context, {}))).toBe(OptionMerger.prototype);
    expect(merger.greet({ b: 2 })).toEqual({ a: 1, b: 2 });
    expect(rbObjRespondTo(merger, "greet")).toBe(true);
    expect(rbObjRespondTo(merger, "missing")).toBe(false);
  });

  it("forwards Object.prototype names to the context, as undef_method leaves them to method_missing", () => {
    const context = { toString: (options: unknown) => `ctx ${JSON.stringify(options)}` };
    const o = new OptionMerger(context, { a: 1 }) as unknown as { toString(): string };
    expect(o.toString()).toBe('ctx {"a":1}');
    expect(o instanceof OptionMerger).toBe(true);
    expect(o.constructor).toBe(OptionMerger);
  });
});
