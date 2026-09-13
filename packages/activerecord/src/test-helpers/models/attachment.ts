import type { Translation } from "./translation.js";
import { Base } from "../../base.js";

export class Attachment extends Base {
  declare record: Base | null;
  declare translation: Translation | null;
  declare record_id: number;
  declare record_type: string;

  static {
    this.belongsTo("record", { polymorphic: true });
    this.hasOne("translation");
  }
}
