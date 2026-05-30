// vendor/rails/activerecord/test/models/vertex.rb
import { Base } from "../../base.js";

export class Vertex extends Base {
  static {
    // trails' inflector pluralizes "vertex" → "vertexes" (see
    // packages/activesupport/src/inflector.test.ts), but the test schema table is
    // "vertices". Assign through the setter (not a static field, which would
    // shadow Base's tableName accessor and skip its override bookkeeping).
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
