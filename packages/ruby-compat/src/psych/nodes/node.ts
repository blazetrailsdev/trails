import { toEnum } from "../../enumerator.js";
import { registerConstant, registeredConstant } from "../../variable.js";
import type { PsychIO } from "../../psych-adapter.js";
import type { Emitter } from "../visitors/emitter.js";
import type { DepthFirst } from "../visitors/depth-first.js";
import type { ToRuby } from "../visitors/to-ruby.js";

/**
 * `Psych::Nodes::Node` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/node.rb:11`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Node {
  /** @noRailsEquivalent PERMANENT */
  readonly children: Node[] = [];
  /** @noRailsEquivalent PERMANENT */
  tag: string | null = null;
  /** @noRailsEquivalent PERMANENT */
  startLine: number | null = null;
  /** @noRailsEquivalent PERMANENT */
  startColumn: number | null = null;
  /** @noRailsEquivalent PERMANENT */
  endLine: number | null = null;
  /** @noRailsEquivalent PERMANENT */
  endColumn: number | null = null;

  /**
   * `Psych::Nodes::Node#each` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/node.rb:38-41`).
   *
   * @noRailsEquivalent PERMANENT
   */
  each(block?: (node: Node) => unknown): unknown {
    if (!block) return toEnum(this, "each");
    const VisitorsDepthFirst = registeredConstant(
      "Psych::Visitors::DepthFirst",
    ) as typeof DepthFirst;
    return new VisitorsDepthFirst(block).accept(this);
  }

  /**
   * `Psych::Nodes::Node#to_ruby` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/node.rb:47-49`).
   *
   * @noRailsEquivalent PERMANENT
   */
  toRuby({ symbolizeNames = false, freeze = false, strictInteger = false } = {}): unknown {
    const VisitorsToRuby = registeredConstant("Psych::Visitors::ToRuby") as typeof ToRuby;
    return VisitorsToRuby.create({ symbolizeNames, freeze, strictInteger }).accept(this);
  }

  /**
   * `Psych::Nodes::Node#yaml` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/node.rb:58-64`).
   *
   * @noRailsEquivalent PERMANENT
   */
  yaml(
    io: PsychIO | null = null,
    options: { indentation?: number; canonical?: boolean; lineWidth?: number } = {},
  ): string | PsychIO {
    let string = "";
    const realIo = io ?? { write: (s: string) => (string += s) };
    const VisitorsEmitter = registeredConstant("Psych::Visitors::Emitter") as typeof Emitter;
    new VisitorsEmitter(realIo, options).accept(this);
    if (!io) return string;
    return io;
  }

  /** @noRailsEquivalent PERMANENT */
  isAlias(): boolean {
    return false;
  }

  /** @noRailsEquivalent PERMANENT */
  isDocument(): boolean {
    return false;
  }

  /** @noRailsEquivalent PERMANENT */
  isMapping(): boolean {
    return false;
  }

  /** @noRailsEquivalent PERMANENT */
  isScalar(): boolean {
    return false;
  }

  /** @noRailsEquivalent PERMANENT */
  isSequence(): boolean {
    return false;
  }

  /** @noRailsEquivalent PERMANENT */
  isStream(): boolean {
    return false;
  }
}

registerConstant("Psych::Nodes::Node", Node);
