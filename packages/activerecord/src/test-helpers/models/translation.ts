import type { Attachment } from "./attachment.js";
// vendor/rails/activerecord/test/models/translation.rb
import { Base } from "../../base.js";

export class Translation extends Base {
  declare attachment: Attachment | null;
  declare loadBelongsTo: (name: "attachment") => Promise<Attachment | null>;
  declare attachment_id: number;
  declare key: string;
  declare locale: string;
  declare value: string;

  static {
    this.belongsTo("attachment", { optional: true });

    this.validates("locale", { presence: true });
    this.validates("key", { presence: true });
    this.validates("value", { presence: true });
  }
}
