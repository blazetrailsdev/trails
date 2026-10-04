import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { queryConstraints } from "../../persistence.js";
import { registerSubclass } from "../../inheritance.js";
import { registerModel } from "../../associations.js";

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

export class ClothingItemUsed extends ClothingItem {
  static {
    rbModConstSet(ClothingItem, "Used", this);
  }
}

export class ClothingItemSized extends ClothingItem {
  static {
    rbModConstSet(ClothingItem, "Sized", this);
  }

  static {
    queryConstraints.call(this, "clothing_type", "color", "size");
  }
}

registerModel("ClothingItem::Used", ClothingItemUsed);
registerModel("ClothingItem::Sized", ClothingItemSized);
for (const klass of [ClothingItemUsed, ClothingItemSized]) {
  registerSubclass(klass);
}
