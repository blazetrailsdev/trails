import type { Translation } from "./translation.js";
import { Base } from "../../base.js";

export class Attachment extends Base {
  declare record_id: number;
  declare record_type: string;

  static {
    this.belongsTo("record", { polymorphic: true });
    this.hasOne("translation");
  }
}
export interface Attachment {
  get record(): Base | null | Promise<Base | null>;
  set record(value: Base | null);
  get translation(): Translation | null | Promise<Translation | null>;
  set translation(value: Translation | null);
}
