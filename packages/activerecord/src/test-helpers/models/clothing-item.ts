// vendor/rails/activerecord/test/models/clothing_item.rb
import { Base } from "../../base.js";
import { queryConstraints } from "../../persistence.js";

export class ClothingItem extends Base {
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
