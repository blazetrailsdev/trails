import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("BindParam", () => {
  it("is equal to other bind params with the same value", () => {
    const a = new Nodes.BindParam(42);
    const b = new Nodes.BindParam(42);
    expect(a.value).toBe(b.value);
  });

  it("is not equal to other nodes", () => {
    const a = new Nodes.BindParam(42);
    const b = new Nodes.Quoted(42);
    expect(a).not.toBeInstanceOf(Nodes.Quoted);
    expect(b).not.toBeInstanceOf(Nodes.BindParam);
  });

  it("is not equal to bind params with different values", () => {
    const a = new Nodes.BindParam(42);
    const b = new Nodes.BindParam(99);
    expect(a.value).not.toBe(b.value);
  });
});
