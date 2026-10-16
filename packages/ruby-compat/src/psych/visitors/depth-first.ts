import type { Node } from "../nodes/node.js";
import { registerConstant } from "../../variable.js";
import { Visitor } from "./visitor.js";

/**
 * `Psych::Visitors::DepthFirst` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/depth_first.rb:4`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class DepthFirst extends Visitor {
  private readonly block: (node: Node) => unknown;

  /** @noRailsEquivalent PERMANENT */
  constructor(block: (node: Node) => unknown) {
    super();
    this.block = block;
  }

  private nary(o: Node): unknown {
    for (const x of o.children) this.visit(x);
    return this.block(o);
  }

  private terminal(o: Node): unknown {
    return this.block(o);
  }

  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesStream = this.nary;
  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesDocument = this.nary;
  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesSequence = this.nary;
  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesMapping = this.nary;
  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesScalar = this.terminal;
  /** @noRailsEquivalent PERMANENT */
  visitPsychNodesAlias = this.terminal;
}

registerConstant("Psych::Visitors::DepthFirst", DepthFirst);
