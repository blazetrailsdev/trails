// vendor/rails/activerecord/test/models/clothing_item.rb
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

// Rails nests these as `ClothingItem::Used` / `ClothingItem::Sized`, so the STI
// `type` column stores the qualified constant path. `moduleName` carries the
// Ruby module so `sti_name` resolves to `"ClothingItem::Used"`.
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

// Track the STI subtree on the `clothing_items` table.
for (const klass of [ClothingItemUsed, ClothingItemSized]) {
  registerSubclass(klass);
}
