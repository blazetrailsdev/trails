import { Base } from "../../../base.js";
import { acceptsNestedAttributesFor } from "../../../nested-attributes.js";
import { generatesTokenFor } from "../../../token-for.js";

export class CpkBook extends Base {
  static _tableName = "cpk_books";

  failDestroy = false;

  static {
    this.belongsTo("order", {
      className: "CpkOrder",
      autosave: true,
      foreignKey: ["shop_id", "order_id"],
      counterCache: true,
    });
    this.belongsTo("orderExplicitFkPk", {
      className: "CpkOrder",
      foreignKey: ["shop_id", "order_id"],
      primaryKey: ["shop_id", "id"],
    });
    this.belongsTo("author", { className: "CpkAuthor" });
    this.hasMany("chapters", { className: "CpkChapter", foreignKey: ["author_id", "book_id"] });
    this.beforeDestroy(function (this: CpkBook) {
      if (this.failDestroy) throw "abort";
    });
  }
}

acceptsNestedAttributesFor(CpkBook, "chapters");
generatesTokenFor(CpkBook, "test");

export class CpkBestSeller extends CpkBook {}

export class CpkBrokenBook extends CpkBook {
  static {
    this.belongsTo("order", { className: "CpkOrderWithSpecialPrimaryKey" });
  }
}

export class CpkBrokenBookWithNonCpkOrder extends CpkBook {
  static {
    this.belongsTo("order", {
      className: "CpkNonCpkOrder",
      foreignKey: ["shop_id", "order_id"],
    });
  }
}

export class CpkNonCpkBook extends CpkBook {
  static {
    this._primaryKey = "id";
    this.belongsTo("nonCpkOrder", { className: "CpkNonCpkOrder", foreignKey: ["order_id"] });
  }
}

export class CpkNullifiedBook extends CpkBook {
  static {
    this.hasOne("chapter", {
      className: "CpkChapter",
      foreignKey: ["author_id", "book_id"],
      dependent: "nullify",
    });
  }
}

export class CpkBookWithOrderAgreements extends CpkBook {
  static {
    this.hasMany("orderAgreements", { through: "order" });
    this.hasOne("orderAgreement", { through: "order", source: "orderAgreements" });
  }
}
