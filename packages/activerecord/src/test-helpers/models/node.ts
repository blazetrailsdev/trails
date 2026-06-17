import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Tree } from "./tree.js";
// vendor/rails/activerecord/test/models/node.rb
import { Base } from "../../base.js";

export class Node extends Base {
  declare tree: Tree | null;
  declare parent: Node | null;
  declare children: AssociationProxy<Node>;
  declare loadBelongsTo: ((name: "tree") => Promise<Tree | null>) &
    ((name: "parent") => Promise<Node | null>);
  declare name: string;
  declare parent_id: number;
  declare tree_id: number;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this.belongsTo("tree", { touch: true });
    this.belongsTo("parent", { className: "Node", touch: true, optional: true });
    this.hasMany("children", { className: "Node", foreignKey: "parent_id", dependent: "destroy" });
  }
}
