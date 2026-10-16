import { beforeEach, describe, expect, it } from "vitest";
import { Hash } from "../hash.js";
import { Psych } from "../psych.js";
import { Alias } from "./nodes/alias.js";
import { Document } from "./nodes/document.js";
import { Mapping } from "./nodes/mapping.js";
import type { Node } from "./nodes/node.js";
import { Scalar } from "./nodes/scalar.js";
import { Sequence } from "./nodes/sequence.js";
import { Stream } from "./nodes/stream.js";
import { Parser } from "./parser.js";
import { TreeBuilder } from "./tree-builder.js";

describe("Psych::TreeBuilder", () => {
  let tree: Stream;

  beforeEach(() => {
    const parser = new Parser(new TreeBuilder());
    parser.parse("%YAML 1.1\n---\n- foo\n- {\n  bar : &A !!str baz,\n  boo : *A\n}\n- *A\n");
    tree = (parser.handler as TreeBuilder).root!;
  });

  it("stream", () => {
    expect(tree).toBeInstanceOf(Stream);
  });

  it("documents", () => {
    expect(tree.children.length).toBe(1);
    const doc = tree.children[0] as Document;
    expect(doc).toBeInstanceOf(Document);
    expect(doc.version).toEqual([1, 1]);
    expect(doc.tagDirectives).toEqual([]);
    expect(doc.implicit).toBe(false);
  });

  it("sequence", () => {
    const seq = tree.children[0].children[0] as Sequence;
    expect(seq).toBeInstanceOf(Sequence);
    expect(seq.anchor).toBeNull();
    expect(seq.tag).toBeNull();
    expect(seq.implicit).toBe(true);
    expect(seq.style).toBe(Sequence.BLOCK);
  });

  it("scalar", () => {
    const seq = tree.children[0].children[0];
    expect(seq.children.length).toBe(3);
    const scalar = seq.children[0] as Scalar;
    expect(scalar).toBeInstanceOf(Scalar);
    expect(scalar.value).toBe("foo");
    expect(scalar.anchor).toBeNull();
    expect(scalar.tag).toBeNull();
    expect(scalar.plain).toBe(true);
    expect(scalar.quoted).toBe(false);
    expect(scalar.style).toBe(Scalar.PLAIN);
  });

  it("mapping", () => {
    const map = tree.children[0].children[0].children[1] as Mapping;
    expect(map).toBeInstanceOf(Mapping);
    expect(map.style).toBe(Mapping.FLOW);
    const tagged = map.children[1] as Scalar;
    expect([tagged.value, tagged.anchor, tagged.tag]).toEqual([
      "baz",
      "A",
      "tag:yaml.org,2002:str",
    ]);
  });

  it("alias", () => {
    const al = tree.children[0].children[0].children[2] as Alias;
    expect(al).toBeInstanceOf(Alias);
    expect(al.anchor).toBe("A");
  });
});

describe("Psych::Nodes::Node", () => {
  it("Psych.parse answers the first document", () => {
    const doc = Psych.parse("--- foo\n...\n--- bar\n") as Document;
    expect(doc).toBeInstanceOf(Document);
    expect(doc.isDocument()).toBe(true);
    expect((doc.root as Scalar).value).toBe("foo");
    expect(doc.implicitEnd).toBe(false);
  });

  it("parse_stream answers the stream", () => {
    const stream = Psych.parseStream("--- foo\n--- bar\n") as Stream;
    expect(stream.isStream()).toBe(true);
    expect(stream.encoding).toBe(Stream.UTF8);
    expect(stream.toRuby()).toEqual(["foo", "bar"]);
  });

  it("predicates", () => {
    const doc = Psych.parse("- &a x\n- *a\n- {}\n") as Document;
    const kinds = [] as string[];
    doc.each((node: Node) => {
      kinds.push(
        [
          node.isAlias() && "alias",
          node.isDocument() && "document",
          node.isMapping() && "mapping",
          node.isScalar() && "scalar",
          node.isSequence() && "sequence",
          node.isStream() && "stream",
        ].find(Boolean) as string,
      );
    });
    expect(kinds).toEqual(["scalar", "alias", "mapping", "sequence", "document"]);
    expect(doc.toRuby()).toEqual(["x", "x", new Hash()]);
  });
});
