import { registerConstant } from "../../variable.js";
import { Node } from "./node.js";

/**
 * `Psych::Nodes::Stream` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/stream.rb:8`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Stream extends Node {
  /** @noRailsEquivalent PERMANENT */
  static readonly UTF8 = 1;

  /** @noRailsEquivalent PERMANENT */
  encoding: number;

  /** @noRailsEquivalent PERMANENT */
  constructor(encoding = Stream.UTF8) {
    super();
    this.encoding = encoding;
  }
}

registerConstant("Psych::Nodes::Stream", Stream);
