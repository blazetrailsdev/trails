import { registerConstant } from "../../variable.js";
import { Node } from "./node.js";

/**
 * `Psych::Nodes::Sequence` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/sequence.rb:41`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Sequence extends Node {
  /** @noRailsEquivalent PERMANENT */
  static readonly ANY = 0;
  /** @noRailsEquivalent PERMANENT */
  static readonly BLOCK = 1;
  /** @noRailsEquivalent PERMANENT */
  static readonly FLOW = 2;

  /** @noRailsEquivalent PERMANENT */
  anchor: string | null;
  /** @noRailsEquivalent PERMANENT */
  implicit: boolean;
  /** @noRailsEquivalent PERMANENT */
  style: number;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    anchor: string | null = null,
    tag: string | null = null,
    implicit = true,
    style: number = Sequence.BLOCK,
  ) {
    super();
    this.anchor = anchor;
    this.tag = tag;
    this.implicit = implicit;
    this.style = style;
  }

  /** @noRailsEquivalent PERMANENT */
  override isSequence(): boolean {
    return true;
  }
}

registerConstant("Psych::Nodes::Sequence", Sequence);
