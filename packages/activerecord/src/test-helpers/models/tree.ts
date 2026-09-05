import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Node } from "./node.js";
import { Base } from "../../base.js";

export class Tree extends Base {
  declare nodes: AssociationProxy<Node>;
  declare name: string;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.hasMany("nodes", { dependent: "destroy" });
  }
}
