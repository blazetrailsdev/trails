import { rbModConstSet, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { queryConstraints } from "../../persistence.js";
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

registerConstant("ClothingItem", ClothingItem);

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

for (const klass of [ClothingItemUsed, ClothingItemSized]) {
  registerModel(klass);
}
