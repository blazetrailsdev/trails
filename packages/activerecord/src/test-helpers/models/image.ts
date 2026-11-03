import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
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
constSet(TopLevel, "Image", Image);
DescendantsTracker.registerSubclass(Base, Image);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Image {
  get imageable(): Base | null | Promise<Base | null>;
  set imageable(value: Base | null);
}
