import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import type { Attribute } from "../attributes/attribute.js";
import { Unary } from "./unary.js";

export class Grouping extends Unary {
  fetchAttribute(block: (attr: Attribute) => boolean): boolean | undefined {
    return (
      this.expr as { fetchAttribute(block: (attr: Attribute) => boolean): boolean | undefined }
    ).fetchAttribute(block);
  }
}

constSet(Nodes, "Grouping", Grouping);
