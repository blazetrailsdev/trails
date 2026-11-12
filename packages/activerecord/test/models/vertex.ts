import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Edge } from "./edge.js";
import { Base } from "../../lib/base.js";

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
constSet(TopLevel, "Vertex", Vertex);
DescendantsTracker.registerSubclass(Base, Vertex);
