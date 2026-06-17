import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Node } from "./node.js";
// vendor/rails/activerecord/test/models/tree.rb
import { Base } from "../../base.js";

export class Tree extends Base {
  declare nodes: AssociationProxy<Node>;
  declare name: string;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this.hasMany("nodes", { dependent: "destroy" });
  }
}
