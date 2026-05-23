// vendor/rails/activerecord/test/models/entry.rb
import { Base } from "../../base.js";

export class Entry extends Base {
  static {
    this.delegatedType("entryable", { types: ["Message", "Comment"] });
    this.belongsTo("account", { touch: true });

    this.delegatedType("thing", {
      types: ["Post"],
      foreignKey: "entryable_id",
      foreignType: "entryable_type",
    });
  }
}
