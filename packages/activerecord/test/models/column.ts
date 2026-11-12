import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Record } from "./record.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Column extends Base {
  declare record_id: number;

  static {
    this.belongsTo("record");
  }
}
constSet(TopLevel, "Column", Column);
DescendantsTracker.registerSubclass(Base, Column);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Column {
  get record(): Record | null | Promise<Record | null>;
  set record(value: Record | null);
}
