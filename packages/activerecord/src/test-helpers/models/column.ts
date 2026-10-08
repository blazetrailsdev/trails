import { registerConstant } from "@blazetrails/ruby-compat";
import type { Record } from "./record.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Column extends Base {
  declare record_id: number;

  static {
    this.belongsTo("record");
  }
}
registerConstant("Column", Column);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Column {
  get record(): Record | null | Promise<Record | null>;
  set record(value: Record | null);
}
