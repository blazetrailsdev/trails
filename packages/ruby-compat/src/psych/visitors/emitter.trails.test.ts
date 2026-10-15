import { describe, it, expect } from "vitest";
import { Psych } from "../../psych.js";
import { Document } from "../nodes/document.js";
import { Mapping } from "../nodes/mapping.js";
import { Scalar } from "../nodes/scalar.js";
import { Stream } from "../nodes/stream.js";
import { YAMLTree } from "./yaml-tree.js";

describe("YAMLTree#tree emitted by Visitors::Emitter", () => {
  class Widget {}

  it("answers a Nodes::Stream holding the pushed document", () => {
    const visitor = YAMLTree.create();
    visitor.push(new Widget());
    const tree = visitor.tree;
    expect(tree).toBeInstanceOf(Stream);
    const document = tree.children[0] as Document;
    expect(document).toBeInstanceOf(Document);
    expect(document.root).toBeInstanceOf(Mapping);
    expect(document.root!.tag).toBe("!ruby/object:Widget");
    expect(tree.yaml()).toBe("--- !ruby/object:Widget {}\n");
  });

  it("writes tagged and untagged roots as ruby -ryaml does", () => {
    expect(Psych.dump(new Widget())).toBe("--- !ruby/object:Widget {}\n");
    expect(Psych.dump({ a: 1 })).toBe("---\na: 1\n");
    expect(Psych.dump({})).toBe("--- {}\n");
    expect(Psych.dump([])).toBe("--- []\n");
    expect(Psych.dump(null)).toBe("---\n");
    expect(Psych.dump("<<")).toBe("--- !!str '<<'\n");
    expect(Psych.dump(":a: b")).toBe("--- ! ':a: b'\n");
    expect(Psych.dump("a\nb")).toBe("--- |-\n  a\n  b\n");
  });

  it("writes an anchored node and its alias", () => {
    const shared = [1];
    expect(Psych.dump([shared, shared])).toBe("---\n- &1\n  - 1\n- *1\n");
  });

  it("passes indentation through to the emitter", () => {
    expect(Psych.dump({ a: { b: 1 } }, { indentation: 4 })).toBe("---\na:\n    b: 1\n");
  });

  it("writes integers and booleans through visit_Integer", () => {
    expect(Psych.dump(Number.MAX_SAFE_INTEGER)).toBe("--- 9007199254740991\n");
    expect(Psych.dump([true, false])).toBe("---\n- true\n- false\n");
  });

  it("answers the io Node#yaml was given", () => {
    const visitor = YAMLTree.create();
    visitor.push({ a: 1 });
    let written = "";
    const io = { write: (s: string) => (written += s) };
    expect(visitor.tree.yaml(io)).toBe(io);
    expect(written).toBe("---\na: 1\n");
  });

  it("writes a flow mapping on the document start line", () => {
    const stream = new Stream();
    const document = new Document([], [], false);
    const mapping = new Mapping(null, null, true, Mapping.FLOW);
    mapping.children.push(new Scalar("a"), new Scalar("1"));
    document.children.push(mapping);
    stream.children.push(document);
    expect(stream.yaml()).toBe("--- {a: 1}\n");
  });

  it("writes a Float the integer-safe range cannot hold as Float#to_s", () => {
    expect(Psych.dump(1e300)).toBe("--- 1.0e+300\n");
  });

  it("indents a root block scalar's continuation lines", () => {
    expect(Psych.dump("a\n\nb")).toBe("--- |-\n  a\n\n  b\n");
    expect(Psych.dump("a\n  b\nc")).toBe("--- |-\n  a\n    b\n  c\n");
  });
});
