import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

// `Arel::Nodes::Node` is instantiable in Ruby (node.rb:8); trails declares the
// class `abstract` even though it has no abstract members.
const NodeCtor = Nodes.Node as unknown as new () => Nodes.Node;

describe("BindParam", () => {
  it("is equal to other bind params with the same value", () => {
    expect(new Nodes.BindParam(1)).toEqual(new Nodes.BindParam(1));
    expect(new Nodes.BindParam("foo")).toEqual(new Nodes.BindParam("foo"));
  });

  it("is not equal to other nodes", () => {
    expect(new Nodes.BindParam(null)).not.toEqual(new NodeCtor());
  });

  it("is not equal to bind params with different values", () => {
    expect(new Nodes.BindParam(1)).not.toEqual(new Nodes.BindParam(2));
  });
});
