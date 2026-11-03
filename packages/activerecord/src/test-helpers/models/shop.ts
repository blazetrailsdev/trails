import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Base } from "../../base.js";

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
constSet(TopLevel, "ShopCollection", ShopCollection);
DescendantsTracker.registerSubclass(Base, ShopCollection);

export class ShopProductType extends Base {
  declare products: AssociationProxy<ShopProduct>;

  static {
    this.tableName = "product_types";

    this.hasMany("products", { className: "ShopProduct", foreignKey: "type_id" });
  }
}
constSet(TopLevel, "ShopProductType", ShopProductType);
DescendantsTracker.registerSubclass(Base, ShopProductType);

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
constSet(TopLevel, "ShopProduct", ShopProduct);
DescendantsTracker.registerSubclass(Base, ShopProduct);

export class ShopVariant extends Base {
  static {
    this.tableName = "variants";
  }
}
constSet(TopLevel, "ShopVariant", ShopVariant);
DescendantsTracker.registerSubclass(Base, ShopVariant);
