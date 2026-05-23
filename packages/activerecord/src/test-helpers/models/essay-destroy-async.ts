// vendor/rails/activerecord/test/models/essay_destroy_async.rb
// Rails uses dependent: :destroy_async on both belongs_to associations.
// Using "destroy" until AssociationOptions.dependent includes "destroyAsync".
import { Base } from "../../base.js";

export class EssayDestroyAsync extends Base {
  static _tableName = "essays";

  static {
    this.belongsTo("book", { dependent: "destroy", className: "BookDestroyAsync" });
    this.belongsTo("writer", { polymorphic: true, dependent: "destroy" });
  }
}

export class LongEssayDestroyAsync extends EssayDestroyAsync {}

export class ShortEssayDestroyAsync extends EssayDestroyAsync {}
