import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

export class Grouping extends Unary {
  fetchAttribute(block: (attr: Node) => boolean): boolean | undefined {
    return (
      this.expr as { fetchAttribute(block: (attr: Node) => boolean): boolean | undefined }
    ).fetchAttribute(block);
  }
}

rbSetClassPathString(Grouping, Nodes, "Grouping");
Nodes.Grouping = Grouping;
