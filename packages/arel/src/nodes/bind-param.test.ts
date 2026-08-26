import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

describe("BindParam", () => {
  it("is equal to other bind params with the same value", () => {
    expect(new Nodes.BindParam(1)).toEqual(new Nodes.BindParam(1));
    expect(new Nodes.BindParam("foo")).toEqual(new Nodes.BindParam("foo"));
  });

  it("is not equal to other nodes", () => {
    expect(new Nodes.BindParam(null)).not.toEqual(new Nodes.Node());
  });

  it("is not equal to bind params with different values", () => {
    expect(new Nodes.BindParam(1)).not.toEqual(new Nodes.BindParam(2));
  });
});
