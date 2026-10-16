import { registerConstant } from "../../variable.js";
import { Parser } from "../parser.js";
import { Node } from "./node.js";

/**
 * `Psych::Nodes::Stream` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/stream.rb:8`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Stream extends Node {
  /** @noRailsEquivalent PERMANENT */
  static readonly ANY = Parser.ANY;
  /** @noRailsEquivalent PERMANENT */
  static readonly UTF8 = Parser.UTF8;
  /** @noRailsEquivalent PERMANENT */
  static readonly UTF16LE = Parser.UTF16LE;
  /** @noRailsEquivalent PERMANENT */
  static readonly UTF16BE = Parser.UTF16BE;

  /** @noRailsEquivalent PERMANENT */
  encoding: number;

  /** @noRailsEquivalent PERMANENT */
  constructor(encoding = Stream.UTF8) {
    super();
    this.encoding = encoding;
  }

  /** @noRailsEquivalent PERMANENT */
  override isStream(): boolean {
    return true;
  }
}

registerConstant("Psych::Nodes::Stream", Stream);
