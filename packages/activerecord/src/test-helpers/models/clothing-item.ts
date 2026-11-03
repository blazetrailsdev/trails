import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { queryConstraints } from "../../persistence.js";

export class ClothingItem extends Base {
  declare clothing_type: string;
  declare color: string;
  declare description: string;
  declare size: string;
  declare "type": string;

  static {
    queryConstraints.call(this, "clothing_type", "color");
  }
}

constSet(TopLevel, "ClothingItem", ClothingItem);
DescendantsTracker.registerSubclass(Base, ClothingItem);

export class ClothingItemUsed extends ClothingItem {
  static {
    constSet(ClothingItem, "Used", this);
    DescendantsTracker.registerSubclass(ClothingItem, this);
  }
}

export class ClothingItemSized extends ClothingItem {
  static {
    constSet(ClothingItem, "Sized", this);
    DescendantsTracker.registerSubclass(ClothingItem, this);
  }

  static {
    queryConstraints.call(this, "clothing_type", "color", "size");
  }
}
