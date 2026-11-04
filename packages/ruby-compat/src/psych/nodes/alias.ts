import { classpaths } from "../../classpath.js";
import { Node } from "./node.js";

/**
 * `Psych::Nodes::Alias` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/alias.rb:9`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Alias extends Node {
  /** @noRailsEquivalent PERMANENT */
  anchor: string;

  /** @noRailsEquivalent PERMANENT */
  constructor(anchor: string) {
    super();
    this.anchor = anchor;
  }

  /** @noRailsEquivalent PERMANENT */
  override isAlias(): boolean {
    return true;
  }
}

classpaths.set(Alias, { path: "Psych::Nodes::Alias", permanent: true });
