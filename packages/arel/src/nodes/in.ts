import { include } from "@blazetrails/activesupport";
import { Nodes } from "../namespaces.js";
import { Binary, NotIn, FetchAttribute } from "./binary.js";
import type { Node } from "./node.js";

export class In extends Binary {
  isEquality(): boolean {
    return true;
  }

  invert(): Node {
    return new NotIn(this.left, this.right);
  }
}

include(
  In as unknown as new (...args: unknown[]) => object,
  FetchAttribute as unknown as Record<string, (...args: unknown[]) => unknown>,
);

Nodes.In = In;
