import { describe, it, expect } from "vitest";
import { Psych } from "../../psych.js";
import { Document } from "../nodes/document.js";
import { Mapping } from "../nodes/mapping.js";
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
});
