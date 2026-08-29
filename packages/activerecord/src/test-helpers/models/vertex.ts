import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Edge } from "./edge.js";
import { Base } from "../../base.js";

export class Vertex extends Base {
  declare sinkEdges: AssociationProxy<Edge>;
  declare sinks: AssociationProxy<Vertex>;
  declare sources: AssociationProxy<Vertex>;

  static {
    this.tableName = "vertices";

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
