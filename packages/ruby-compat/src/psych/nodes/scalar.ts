import { registerConstant } from "../../variable.js";
import { Node } from "./node.js";

/**
 * `Psych::Nodes::Scalar` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/scalar.rb:8`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Scalar extends Node {
  /** @noRailsEquivalent PERMANENT */
  static readonly ANY = 0;
  /** @noRailsEquivalent PERMANENT */
  static readonly PLAIN = 1;
  /** @noRailsEquivalent PERMANENT */
  static readonly SINGLE_QUOTED = 2;
  /** @noRailsEquivalent PERMANENT */
  static readonly DOUBLE_QUOTED = 3;
  /** @noRailsEquivalent PERMANENT */
  static readonly LITERAL = 4;
  /** @noRailsEquivalent PERMANENT */
  static readonly FOLDED = 5;

  /** @noRailsEquivalent PERMANENT */
  value: string;
  /** @noRailsEquivalent PERMANENT */
  anchor: string | null;
  /** @noRailsEquivalent PERMANENT */
  plain: boolean;
  /** @noRailsEquivalent PERMANENT */
  quoted: boolean;
  /** @noRailsEquivalent PERMANENT */
  style: number;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    value: string,
    anchor: string | null = null,
    tag: string | null = null,
    plain = true,
    quoted = false,
    style: number = Scalar.ANY,
  ) {
    super();
    this.value = value;
    this.anchor = anchor;
    this.tag = tag;
    this.plain = plain;
    this.quoted = quoted;
    this.style = style;
  }

  /** @noRailsEquivalent PERMANENT */
  override isScalar(): boolean {
    return true;
  }
}

registerConstant("Psych::Nodes::Scalar", Scalar);
