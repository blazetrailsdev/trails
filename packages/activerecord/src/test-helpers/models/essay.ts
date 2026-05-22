// vendor/rails/activerecord/test/models/essay.rb
import { Base } from "../../base.js";

export class Essay extends Base {
  static {
    this.belongsTo("author", { primaryKey: "name" });
    this.belongsTo("writer", { primaryKey: "name", polymorphic: true });
    this.belongsTo("category", { primaryKey: "name" });
    this.hasOne("owner", { primaryKey: "name" });
  }
}

export class EssaySpecial extends Essay {}

export class TypedEssay extends Essay {}
