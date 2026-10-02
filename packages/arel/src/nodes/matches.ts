import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Binary, NodeOrValue } from "./binary.js";
import { buildQuoted } from "./casted.js";
import type { ArelNode } from "../arel.js";

export class Matches extends Binary {
  readonly escape: ArelNode | null;
  caseSensitive: boolean;
  constructor(
    left: NodeOrValue,
    right: NodeOrValue,
    escape: string | ArelNode | null = null,
    caseSensitive = false,
  ) {
    super(left, right);
    this.escape = escape == null ? null : buildQuoted(escape);
    this.caseSensitive = caseSensitive;
  }
}

export class DoesNotMatch extends Matches {}

rbModConstSet(Nodes, "Matches", Matches);
rbModConstSet(Nodes, "DoesNotMatch", DoesNotMatch);
