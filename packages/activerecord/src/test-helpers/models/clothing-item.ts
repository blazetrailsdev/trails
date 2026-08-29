import { Base } from "../../base.js";
import { queryConstraints } from "../../persistence.js";
import { registerSubclass } from "../../inheritance.js";

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
  static moduleName = "ClothingItem";
  static _demodulizedName = "Used";
}

export class ClothingItemSized extends ClothingItem {
  static moduleName = "ClothingItem";
  static _demodulizedName = "Sized";

  static {
    queryConstraints.call(this, "clothing_type", "color", "size");
  }
}

for (const klass of [ClothingItemUsed, ClothingItemSized]) {
  registerSubclass(klass);
}
