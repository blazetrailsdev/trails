import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Binary, NodeOrValue } from "./binary.js";

export class Regexp extends Binary {
  caseSensitive: boolean;
  constructor(left: NodeOrValue, right: NodeOrValue, caseSensitive = true) {
    super(left, right);
    this.caseSensitive = caseSensitive;
  }
}

export class NotRegexp extends Binary {
  caseSensitive: boolean;
  constructor(left: NodeOrValue, right: NodeOrValue, caseSensitive = true) {
    super(left, right);
    this.caseSensitive = caseSensitive;
  }
}

rbSetClassPathString(Regexp, Nodes, "Regexp");
Nodes.Regexp = Regexp;
rbSetClassPathString(NotRegexp, Nodes, "NotRegexp");
Nodes.NotRegexp = NotRegexp;
