import { describe, it } from "vitest";
import { Nodes } from "./index.js";
import { assertEmpty } from "./test-helpers/assertions.js";

type ClassRef = { prototype?: object };

// The class that declares `name` on a prototype chain — the JS reading of
// Ruby's `instance_method(:x).owner`.
function owner(klass: ClassRef, name: string): unknown {
  for (let k: unknown = klass; k; k = Object.getPrototypeOf(k) as unknown) {
    const proto = (k as ClassRef).prototype;
    if (proto && Object.prototype.hasOwnProperty.call(proto, name)) return k;
  }
  return null;
}

describe("TestNodes", () => {
  it("every arel nodes have hash eql eqeq from same class", () => {
    const nodeDescendants = (Object.values(Nodes) as unknown[]).filter(
      (k): k is ClassRef =>
        typeof k === "function" &&
        (k as ClassRef).prototype instanceof Nodes.Node &&
        k !== Nodes.NodeExpression &&
        // Ruby's ObjectSpace walk over `Arel::Nodes::Node`'s singleton class
        // never yields SqlLiteral: it is a String subclass upstream
        // (sql_literal.rb:5), and `#==`/`#eql?`/`#hash` all arrive from String.
        // trails has to extend Node instead — TypeScript cannot subclass the
        // string primitive — so the Ruby population is reproduced here rather
        // than in the class hierarchy. `nodes/node_test.rb:14` skips it for the
        // same reason.
        k !== Nodes.SqlLiteral,
    );

    const badNodeDescendants = nodeDescendants.filter((subnode) => {
      const eqlOwner = owner(subnode, "eql");
      const hashOwner = owner(subnode, "hash");
      return eqlOwner !== hashOwner;
    });

    const problemMsg =
      "Some subclasses of Arel::Nodes::Node do not have a" +
      " #== or #eql? or #hash defined from the same class as the others";
    assertEmpty(badNodeDescendants, problemMsg);
  });
});
