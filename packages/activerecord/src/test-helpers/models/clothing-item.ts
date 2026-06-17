// vendor/rails/activerecord/test/models/clothing_item.rb
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

export class ClothingItemUsed extends ClothingItem {}

export class ClothingItemSized extends ClothingItem {
  static {
    queryConstraints.call(this, "clothing_type", "color", "size");
  }
}

// Track the STI subtree on the `clothing_items` table.
for (const klass of [ClothingItemUsed, ClothingItemSized]) {
  registerSubclass(klass);
}

// Rails nests these as `ClothingItem::Used` / `ClothingItem::Sized`, so the STI
// `type` column stores the qualified constant path. Register those Ruby names so
// the row-path resolver's global fallback maps them to the TS classes (whose
// `sti_name` is the unqualified JS class name).
registerModel("ClothingItem::Used", ClothingItemUsed);
registerModel("ClothingItem::Sized", ClothingItemSized);
