import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Vertex } from "./vertex.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Edge extends Base {
  declare sink_id: number;
  declare source_id: number;

  static {
    this.belongsTo("source", { className: "Vertex", foreignKey: "source_id" });
    this.belongsTo("sink", { className: "Vertex", foreignKey: "sink_id" });
  }
}
constSet(TopLevel, "Edge", Edge);
DescendantsTracker.registerSubclass(Base, Edge);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Edge {
  get source(): Vertex | null | Promise<Vertex | null>;
  set source(value: Vertex | null);
  get sink(): Vertex | null | Promise<Vertex | null>;
  set sink(value: Vertex | null);
}
