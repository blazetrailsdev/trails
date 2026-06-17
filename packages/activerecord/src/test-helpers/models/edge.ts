import type { Vertex } from "./vertex.js";
// vendor/rails/activerecord/test/models/edge.rb
import { Base } from "../../base.js";

export class Edge extends Base {
  declare source: Vertex | null;
  declare sink: Vertex | null;
  declare loadBelongsTo: ((name: "source") => Promise<Vertex | null>) &
    ((name: "sink") => Promise<Vertex | null>);
  declare sink_id: number;
  declare source_id: number;

  static {
    this.belongsTo("source", { className: "Vertex", foreignKey: "source_id" });
    this.belongsTo("sink", { className: "Vertex", foreignKey: "sink_id" });
  }
}
