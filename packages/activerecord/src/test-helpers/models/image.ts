// vendor/rails/activerecord/test/models/image.rb
import { Base } from "../../base.js";

export class Image extends Base {
  static {
    this.belongsTo("imageable", {
      polymorphic: true,
      foreignKey: "imageable_identifier",
      foreignType: "imageable_class",
    });
  }
}
