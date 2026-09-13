import { Base } from "../../base.js";

export class Image extends Base {
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
export interface Image {
  get imageable(): Base | null | Promise<Base | null>;
  set imageable(value: Base | null);
}
