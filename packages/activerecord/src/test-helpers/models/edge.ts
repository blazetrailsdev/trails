// vendor/rails/activerecord/test/models/edge.rb
import { Base } from "../../base.js";

export class Edge extends Base {
  static {
    this.belongsTo("source", { className: "Vertex", foreignKey: "source_id" });
    this.belongsTo("sink", { className: "Vertex", foreignKey: "sink_id" });
  }
}
