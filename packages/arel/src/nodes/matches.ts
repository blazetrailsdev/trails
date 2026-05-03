import { Binary, NodeOrValue } from "./binary.js";
import type { Node } from "./node.js";
import { buildQuoted } from "./casted.js";

/**
 * Mirrors Arel::Nodes::Matches (matches.rb): the escape argument is
 * wrapped via `Nodes.build_quoted(escape)` at construction so the
 * stored `escape` field is always a Node (or null). The visitor can
 * then `visit(o.escape)` unconditionally without inspecting type.
 */
export class Matches extends Binary {
  readonly escape: Node | null;
  caseSensitive: boolean;
  constructor(
    left: NodeOrValue,
    right: NodeOrValue,
    escape: string | Node | null = null,
    caseSensitive = false,
  ) {
    super(left, right);
    this.escape = escape == null ? null : buildQuoted(escape);
    this.caseSensitive = caseSensitive;
  }
}

// Rails: `class DoesNotMatch < Matches; end` — same shape, same wrapping.
export class DoesNotMatch extends Matches {}
