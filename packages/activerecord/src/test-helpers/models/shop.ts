import { registerConstant } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
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
registerConstant("ShopCollection", ShopCollection);

export class ShopProductType extends Base {
  declare products: AssociationProxy<ShopProduct>;

  static {
    this.tableName = "product_types";

    this.hasMany("products", { className: "ShopProduct", foreignKey: "type_id" });
  }
}
registerConstant("ShopProductType", ShopProductType);

export class ShopProduct extends Base {
  declare variants: AssociationProxy<ShopVariant>;
  declare "type": ShopProductType | null;

  static {
    this.tableName = "products";

    this.hasMany("variants", {
      className: "ShopVariant",
      foreignKey: "product_id",
      dependent: "deleteAll",
    });
    this.belongsTo("type", { className: "ShopProductType" });
  }
}
registerConstant("ShopProduct", ShopProduct);

export class ShopVariant extends Base {
  static {
    this.tableName = "variants";
  }
}
registerConstant("ShopVariant", ShopVariant);

registerModel([ShopCollection, ShopProductType, ShopProduct, ShopVariant]);
