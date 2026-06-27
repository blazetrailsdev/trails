import type { AssociationProxy } from "../../associations/collection-proxy.js";
// vendor/rails/activerecord/test/models/shop.rb
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class ShopCollection extends Base {
  declare products: AssociationProxy<ShopProduct>;

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
  declare products: AssociationProxy<ShopProduct>;

  static {
    this.tableName = "product_types";

    this.hasMany("products", { className: "ShopProduct", foreignKey: "type_id" });
  }
}

export class ShopProduct extends Base {
  declare variants: AssociationProxy<ShopVariant>;
  declare "type": ShopProductType | null;
  declare loadBelongsTo: (name: "type") => Promise<ShopProductType | null>;

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

registerModel([ShopCollection, ShopProductType, ShopProduct, ShopVariant]);
