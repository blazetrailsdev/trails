// vendor/rails/activerecord/test/models/vertex.rb
import { Base } from "../../base.js";

export class Vertex extends Base {
  static {
    this.hasMany("sinkEdges", { className: "Edge", foreignKey: "source_id" });
    this.hasMany("sinks", { through: "sinkEdges" });
    this.hasAndBelongsToMany("sources", {
      className: "Vertex",
      joinTable: "edges",
      foreignKey: "sink_id",
      associationForeignKey: "source_id",
    });
  }
}
