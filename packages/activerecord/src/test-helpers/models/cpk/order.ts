import { Base } from "../../../base.js";

export class CpkOrder extends Base {
  static _tableName = "cpk_orders";

  static {
    this._primaryKey = ["shop_id", "id"];
    this.aliasAttribute("idValue", "id");
    this.hasMany("orderAgreements", {
      className: "CpkOrderAgreement",
      foreignKey: "order_id",
      primaryKey: "id",
    });
    this.hasMany("books", { className: "CpkBook", foreignKey: ["shop_id", "order_id"] });
    this.hasOne("book", { className: "CpkBook", foreignKey: ["shop_id", "order_id"] });
    this.hasMany("orderTags", {
      className: "CpkOrderTag",
      foreignKey: "order_id",
      primaryKey: "id",
    });
    this.hasMany("tags", { className: "CpkTag", through: "orderTags" });
  }
}

export class CpkBrokenOrder extends CpkOrder {
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkBook" });
    this.hasOne("book", { className: "CpkBook" });
  }
}

export class CpkOrderWithSpecialPrimaryKey extends CpkOrder {
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkBook", foreignKey: ["shop_id", "status"] });
    this.hasOne("book", { className: "CpkBook", foreignKey: ["shop_id", "status"] });
  }
}

export class CpkBrokenOrderWithNonCpkBooks extends CpkOrder {
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkNonCpkBook" });
    this.hasOne("book", { className: "CpkNonCpkBook" });
  }
}

export class CpkNonCpkOrder extends CpkOrder {
  static {
    this._primaryKey = "id";
  }
}

export class CpkOrderWithPrimaryKeyAssociatedBook extends CpkOrder {
  static {
    this.hasOne("book", { className: "CpkBook", foreignKey: "order_id", primaryKey: "id" });
  }
}

export class CpkOrderWithNullifiedBook extends CpkOrder {
  static {
    this.hasOne("book", {
      className: "CpkBook",
      foreignKey: ["shop_id", "order_id"],
      dependent: "nullify",
    });
  }
}

export class CpkOrderWithSingularBookChapters extends CpkOrder {
  static {
    this.hasMany("chapters", { className: "CpkChapter", through: "book" });
  }
}
