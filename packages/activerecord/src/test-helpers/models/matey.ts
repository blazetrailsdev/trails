// vendor/rails/activerecord/test/models/matey.rb
import { Base } from "../../base.js";

export class Matey extends Base {
  // Rails creates the `mateys` table with `id: false`, so the model has no
  // primary key (operations like `find_signed` / `find_by_token_for` raise
  // UnknownPrimaryKey). The framework defaults `primaryKey` to "id" unless a
  // falsy-but-non-null value is set, and the schema's `primaryKey: false` is not
  // propagated to the model — declare the absence explicitly.
  static _primaryKey = "";

  static {
    this.belongsTo("pirate");
    this.belongsTo("target", { className: "Pirate" });
  }
}
