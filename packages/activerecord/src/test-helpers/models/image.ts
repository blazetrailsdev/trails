// vendor/rails/activerecord/test/models/image.rb
import { Base } from "../../base.js";

export class Image extends Base {
  declare imageable: Base | null;
  declare loadBelongsTo: (name: "imageable") => Promise<Base | null>;
  declare imageable_class: string;
  declare imageable_identifier: number;

  static {
    this.belongsTo("imageable", {
      polymorphic: true,
      foreignKey: "imageable_identifier",
      foreignType: "imageable_class",
    });
  }
}
