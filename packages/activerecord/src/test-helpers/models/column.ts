import type { Record } from "./record.js";
import { Base } from "../../base.js";

export class Column extends Base {
  declare record_id: number;

  static {
    this.belongsTo("record");
  }
}
export interface Column {
  get record(): Record | null | Promise<Record | null>;
  set record(value: Record | null);
}
