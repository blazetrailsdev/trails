// vendor/rails/activerecord/test/models/translation.rb
import { Base } from "../../base.js";

export class Translation extends Base {
  static {
    this.belongsTo("attachment", { optional: true });

    this.validates("locale", { presence: true });
    this.validates("key", { presence: true });
    this.validates("value", { presence: true });
  }
}
