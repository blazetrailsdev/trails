import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Image {
  get imageable(): Base | null | Promise<Base | null>;
  set imageable(value: Base | null);
}
