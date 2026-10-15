import { registerConstant } from "../../variable.js";
import { Node } from "./node.js";

/**
 * `Psych::Nodes::Mapping` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/mapping.rb:15`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Mapping extends Node {
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
    style: number = Mapping.BLOCK,
  ) {
    super();
    this.anchor = anchor;
    this.tag = tag;
    this.implicit = implicit;
    this.style = style;
  }
}

registerConstant("Psych::Nodes::Mapping", Mapping);
