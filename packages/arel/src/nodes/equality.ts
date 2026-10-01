import { include } from "@blazetrails/activesupport";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { Binary, NotEqual, FetchAttribute } from "./binary.js";
import type { Node } from "./node.js";

export class Equality extends Binary {
  isEquality(): boolean {
    return true;
  }

  invert(): Node {
    return new NotEqual(this.left, this.right);
  }
}

include(
  Equality as unknown as new (...args: unknown[]) => object,
  FetchAttribute as unknown as Record<string, (...args: unknown[]) => unknown>,
);

rbSetClassPathString(Equality, Nodes, "Equality");
Nodes.Equality = Equality;
