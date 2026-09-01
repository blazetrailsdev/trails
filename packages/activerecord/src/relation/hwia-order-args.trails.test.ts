import { describe, it, expect } from "vitest";
import "../index.js";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { columnReferences, flattenedArgs, validateOrderArgs } from "./query-methods.js";

describe("HashWithIndifferentAccess order arguments", () => {
  it("walks to the same result as the plain hash it stands for", () => {
    const hash = new HashWithIndifferentAccess<unknown>({ id: "desc" });
    expect(flattenedArgs([hash])).toEqual(flattenedArgs([{ id: "desc" }]));
    expect(columnReferences([hash])).toEqual(columnReferences([{ id: "desc" }]));
  });

  it("validates its directions", () => {
    const host = {} as never;
    expect(() =>
      validateOrderArgs.call(host, [new HashWithIndifferentAccess({ id: "desc" })]),
    ).not.toThrow();
    expect(() =>
      validateOrderArgs.call(host, [new HashWithIndifferentAccess({ id: "sideways" })]),
    ).toThrow(/Direction "sideways" is invalid/);
  });
});
