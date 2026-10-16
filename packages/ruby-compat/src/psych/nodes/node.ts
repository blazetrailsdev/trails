import { registerConstant, registeredConstant } from "../../variable.js";
import type { PsychIO } from "../../psych-adapter.js";
import type { Emitter } from "../visitors/emitter.js";

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
}

registerConstant("Psych::Nodes::Node", Node);
