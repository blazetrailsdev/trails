// vendor/rails/activerecord/test/models/shop.rb
import { Base } from "../../base.js";

export class ShopCollection extends Base {
  static {
    this.tableName = "collections";

    this.hasMany("products", {
      className: "ShopProduct",
      foreignKey: "collection_id",
      dependent: "nullify",
    });
  }
}

export class ShopProductType extends Base {
  static {
    this.tableName = "product_types";

    this.hasMany("products", { className: "ShopProduct", foreignKey: "type_id" });
  }
}

export class ShopProduct extends Base {
  static {
    this.tableName = "products";

    this.hasMany("variants", {
      className: "ShopVariant",
      foreignKey: "product_id",
      dependent: "delete",
    });
    this.belongsTo("type", { className: "ShopProductType" });
  }
}

export class ShopVariant extends Base {
  static {
    this.tableName = "variants";
  }
}
