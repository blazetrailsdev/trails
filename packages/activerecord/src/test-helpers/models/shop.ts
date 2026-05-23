// vendor/rails/activerecord/test/models/shop.rb
import { Base } from "../../base.js";

export class ShopCollection extends Base {
  static {
    this.tableName = "collections";

    this.hasMany("products", { dependent: "nullify" });
  }
}

export class ShopProductType extends Base {
  static {
    this.tableName = "product_types";

    this.hasMany("products");
  }
}

export class ShopProduct extends Base {
  static {
    this.tableName = "products";

    this.hasMany("variants", { dependent: "delete" });
    this.belongsTo("type", { className: "ShopProductType" });
  }
}

export class ShopVariant extends Base {
  static {
    this.tableName = "variants";
  }
}
