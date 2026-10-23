import { registerConstant } from "../../variable.js";
import { Node } from "./node.js";

/**
 * `Psych::Nodes::Document` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/document.rb:12`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Document extends Node {
  /** @noRailsEquivalent PERMANENT */
  version: number[];
  /** @noRailsEquivalent PERMANENT */
  tagDirectives: [string, string][];
  /** @noRailsEquivalent PERMANENT */
  implicit: boolean;
  /** @noRailsEquivalent PERMANENT */
  implicitEnd: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(version: number[] = [], tagDirectives: [string, string][] = [], implicit = false) {
    super();
    this.version = version;
    this.tagDirectives = tagDirectives;
    this.implicit = implicit;
    this.implicitEnd = true;
  }

  /** @noRailsEquivalent PERMANENT */
  get root(): Node | undefined {
    return this.children[0];
  }

  /** @noRailsEquivalent PERMANENT */
  override isDocument(): boolean {
    return true;
  }
}

registerConstant("Psych::Nodes::Document", Document);
