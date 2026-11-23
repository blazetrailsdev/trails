import { describe, expect, it } from "vitest";
import { block } from "@blazetrails/ruby-compat";
import { Delegator } from "../../../lib/core-ext/object/try.js";

describe("Delegator", () => {
  it("try yields the delegator to a block", () => {
    const d = new Delegator({ greet: () => "hello" });
    expect(d.try(block((self: unknown) => self))).toBe(d);
    expect(d.tryBang(block((self: unknown) => self))).toBe(d);
  });
});
