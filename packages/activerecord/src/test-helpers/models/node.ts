// vendor/rails/activerecord/test/models/node.rb
import { Base } from "../../base.js";

export class Node extends Base {
  static {
    this.belongsTo("tree", { touch: true });
    this.belongsTo("parent", { className: "Node", touch: true, optional: true });
    this.hasMany("children", { className: "Node", foreignKey: "parent_id", dependent: "destroy" });
  }
}
