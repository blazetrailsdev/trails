import type { Record } from "./record.js";
import { Base } from "../../base.js";

export class Column extends Base {
  declare record: Record | null;
  declare loadBelongsTo: (name: "record") => Promise<Record | null>;
  declare record_id: number;

  static {
    this.belongsTo("record");
  }
}
