import { include } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
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

const fetchAttributeModule = FetchAttribute as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;
const includer = In as unknown as new (...args: unknown[]) => object;
include(includer, fetchAttributeModule);

constSet(Nodes, "In", In);
