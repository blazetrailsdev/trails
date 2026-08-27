import { describe, it, expect } from "vitest";
import { Collectors } from "../index.js";

describe("TestComposite", () => {
  it("addBind forwards block to both collectors", () => {
    const left = new Collectors.SQLString();
    const calls: number[] = [];
    const right = new Collectors.Bind();
    const composite = new Collectors.Composite(left, right);
    composite.addBind(42, (i) => {
      calls.push(i);
      return `$${i}`;
    });
    expect(left.value).toBe("$1");
    expect(right.value).toEqual([42]);
    expect(calls).toEqual([1]);
  });

  it("addBinds forwards block to both collectors", () => {
    const left = new Collectors.SQLString();
    const calls: number[] = [];
    const right = new Collectors.Bind();
    const composite = new Collectors.Composite(left, right);
    composite.addBinds([1, 2], null, (i) => {
      calls.push(i);
      return `$${i}`;
    });
    expect(left.value).toBe("$1, $2");
    expect(right.value).toEqual([1, 2]);
    expect(calls).toEqual([1, 2]);
  });
});
