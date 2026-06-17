import type { Translation } from "./translation.js";
// vendor/rails/activerecord/test/models/attachment.rb
import { Base } from "../../base.js";

export class Attachment extends Base {
  declare record: Base | null;
  declare translation: Translation | null;
  declare loadBelongsTo: (name: "record") => Promise<Base | null>;
  declare loadHasOne: (name: "translation") => Promise<Translation | null>;
  declare record_id: number;
  declare record_type: string;

  static {
    this.belongsTo("record", { polymorphic: true });
    this.hasOne("translation");
  }
}
