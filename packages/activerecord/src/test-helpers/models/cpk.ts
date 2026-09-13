import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { throwAbort } from "@blazetrails/activesupport";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class CpkAuthor extends Base {
  declare books: AssociationProxy<CpkBook>;
  declare name: string;

  static _tableName = "cpk_authors";
  static _demodulizedName = "Author";

  static {
    this.hasMany("books", { className: "CpkBook", foreignKey: "author_id", dependent: "delete" });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBook extends Base {
  declare chapters: AssociationProxy<CpkChapter>;
  declare author_id: number;
  declare order_id: number;
  declare revision: number;
  declare shop_id: number;
  declare title: string;

  static _tableName = "cpk_books";
  static _demodulizedName = "Book";

  failDestroy = false;

  static {
    this._primaryKey = ["author_id", "id"];
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
      if (this.failDestroy) throwAbort();
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBook {
  get order(): CpkOrder | null | Promise<CpkOrder | null>;
  set order(value: CpkOrder | null);
  get orderExplicitFkPk(): CpkOrder | null | Promise<CpkOrder | null>;
  set orderExplicitFkPk(value: CpkOrder | null);
  get author(): CpkAuthor | null | Promise<CpkAuthor | null>;
  set author(value: CpkAuthor | null);
}

acceptsNestedAttributesFor(CpkBook, "chapters");
CpkBook.generatesTokenFor("test");

export class CpkBestSeller extends CpkBook {
  static _demodulizedName = "BestSeller";
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBrokenBook extends CpkBook {
  static _demodulizedName = "BrokenBook";
  static {
    this.belongsTo("order", { className: "CpkOrderWithSpecialPrimaryKey" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBrokenBook {
  get order(): CpkOrderWithSpecialPrimaryKey | null | Promise<CpkOrderWithSpecialPrimaryKey | null>;
  set order(value: CpkOrderWithSpecialPrimaryKey | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBrokenBookWithNonCpkOrder extends CpkBook {
  static _demodulizedName = "BrokenBookWithNonCpkOrder";
  static {
    this.belongsTo("order", {
      className: "CpkNonCpkOrder",
      foreignKey: ["shop_id", "order_id"],
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBrokenBookWithNonCpkOrder {
  get order(): CpkNonCpkOrder | null | Promise<CpkNonCpkOrder | null>;
  set order(value: CpkNonCpkOrder | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkNonCpkBook extends CpkBook {
  static _demodulizedName = "NonCpkBook";
  static {
    this._primaryKey = "id";
    this.belongsTo("nonCpkOrder", { className: "CpkNonCpkOrder", foreignKey: ["order_id"] });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkNonCpkBook {
  get nonCpkOrder(): CpkNonCpkOrder | null | Promise<CpkNonCpkOrder | null>;
  set nonCpkOrder(value: CpkNonCpkOrder | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkNullifiedBook extends CpkBook {
  static _demodulizedName = "NullifiedBook";
  static {
    this.hasOne("chapter", {
      className: "CpkChapter",
      foreignKey: ["author_id", "book_id"],
      dependent: "nullify",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkNullifiedBook {
  get chapter(): CpkChapter | null | Promise<CpkChapter | null>;
  set chapter(value: CpkChapter | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBookWithOrderAgreements extends CpkBook {
  declare orderAgreements: AssociationProxy<CpkOrderAgreement>;

  static _demodulizedName = "BookWithOrderAgreements";
  static {
    this.hasMany("orderAgreements", { through: "order" });
    this.hasOne("orderAgreement", { through: "order", source: "orderAgreements" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBookWithOrderAgreements {
  get orderAgreement(): CpkOrderAgreement | null | Promise<CpkOrderAgreement | null>;
  set orderAgreement(value: CpkOrderAgreement | null);
}

export class CpkBookDestroyAsync extends Base {
  declare chapters: AssociationProxy<CpkChapterDestroyAsync>;

  static _demodulizedName = "BookDestroyAsync";
  static _tableName = "cpk_books";

  static {
    this.hasMany("chapters", {
      foreignKey: ["author_id", "book_id"],
      className: "CpkChapterDestroyAsync",
      dependent: "destroy",
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkChapter extends Base {
  declare author_id: number;
  declare book_id: number;
  declare title: string;

  static _demodulizedName = "Chapter";
  static _tableName = "cpk_chapters";

  static {
    this._primaryKey = ["author_id", "id"];
    this.belongsTo("book", { className: "CpkBook", foreignKey: ["author_id", "book_id"] });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkChapter {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkChapterDestroyAsync extends Base {
  static _demodulizedName = "ChapterDestroyAsync";
  static _tableName = "cpk_chapters";

  static {
    this._primaryKey = ["author_id", "id"];
    this.belongsTo("book", {
      foreignKey: ["author_id", "book_id"],
      className: "CpkBookDestroyAsync",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkChapterDestroyAsync {
  get book(): CpkBookDestroyAsync | null | Promise<CpkBookDestroyAsync | null>;
  set book(value: CpkBookDestroyAsync | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrder extends Base {
  declare orderAgreements: AssociationProxy<CpkOrderAgreement>;
  declare books: AssociationProxy<CpkBook>;
  declare orderTags: AssociationProxy<CpkOrderTag>;
  declare tags: AssociationProxy<CpkTag>;
  declare books_count: number | null;
  declare shop_id: number;
  declare status: string;

  static _tableName = "cpk_orders";
  static _demodulizedName = "Order";

  static {
    this._primaryKey = ["shop_id", "id"];
    this.aliasAttribute("id_value", "id");
    this.hasMany("orderAgreements", {
      className: "CpkOrderAgreement",
      foreignKey: "order_id",
    });
    this.hasMany("books", { className: "CpkBook", foreignKey: ["shop_id", "order_id"] });
    this.hasOne("book", { className: "CpkBook", foreignKey: ["shop_id", "order_id"] });
    this.hasMany("orderTags", {
      className: "CpkOrderTag",
      foreignKey: "order_id",
    });
    this.hasMany("tags", { className: "CpkTag", through: "orderTags" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrder {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBrokenOrder extends CpkOrder {
  static _demodulizedName = "BrokenOrder";
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkBook" });
    this.hasOne("book", { className: "CpkBook" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBrokenOrder {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderWithSpecialPrimaryKey extends CpkOrder {
  static _demodulizedName = "OrderWithSpecialPrimaryKey";
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkBook", foreignKey: ["shop_id", "status"] });
    this.hasOne("book", { className: "CpkBook", foreignKey: ["shop_id", "status"] });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrderWithSpecialPrimaryKey {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBrokenOrderWithNonCpkBooks extends CpkOrder {
  static _demodulizedName = "BrokenOrderWithNonCpkBooks";
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkNonCpkBook" });
    this.hasOne("book", { className: "CpkNonCpkBook" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBrokenOrderWithNonCpkBooks {
  get book(): CpkNonCpkBook | null | Promise<CpkNonCpkBook | null>;
  set book(value: CpkNonCpkBook | null);
}

export class CpkNonCpkOrder extends CpkOrder {
  static _demodulizedName = "NonCpkOrder";
  static {
    this._primaryKey = "id";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderWithPrimaryKeyAssociatedBook extends CpkOrder {
  static _demodulizedName = "OrderWithPrimaryKeyAssociatedBook";
  static {
    this.hasOne("book", { className: "CpkBook", foreignKey: "order_id" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrderWithPrimaryKeyAssociatedBook {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderWithNullifiedBook extends CpkOrder {
  static _demodulizedName = "OrderWithNullifiedBook";
  static {
    this.hasOne("book", {
      className: "CpkBook",
      foreignKey: ["shop_id", "order_id"],
      dependent: "nullify",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrderWithNullifiedBook {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

export class CpkOrderWithSingularBookChapters extends CpkOrder {
  declare chapters: AssociationProxy<CpkChapter>;

  static _demodulizedName = "OrderWithSingularBookChapters";
  static {
    this.hasMany("chapters", { className: "CpkChapter", through: "book" });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderAgreement extends Base {
  declare order_id: number;
  declare signature: string;

  static _demodulizedName = "OrderAgreement";
  static _tableName = "cpk_order_agreements";

  static {
    this.belongsTo("order", { className: "CpkOrder" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrderAgreement {
  get order(): CpkOrder | null | Promise<CpkOrder | null>;
  set order(value: CpkOrder | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderTag extends Base {
  declare attached_by: string;
  declare attached_reason: string;
  declare order_id: number;
  declare tag_id: number;

  static _demodulizedName = "OrderTag";
  static _tableName = "cpk_order_tags";
  static _primaryKey = ["order_id", "tag_id"];

  static {
    this.belongsTo("tag", { className: "CpkTag" });
    this.belongsTo("order", { className: "CpkOrder" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrderTag {
  get tag(): CpkTag | null | Promise<CpkTag | null>;
  set tag(value: CpkTag | null);
  get order(): CpkOrder | null | Promise<CpkOrder | null>;
  set order(value: CpkOrder | null);
}

export class CpkTag extends Base {
  declare orderTags: AssociationProxy<CpkOrderTag>;
  declare orders: AssociationProxy<CpkOrder>;
  declare name: string;

  static _demodulizedName = "Tag";
  static _tableName = "cpk_tags";

  static {
    this.hasMany("orderTags", { className: "CpkOrderTag", foreignKey: "tag_id" });
    this.hasMany("orders", { className: "CpkOrder", through: "orderTags" });
  }
}

export class CpkPost extends Base {
  declare comments: AssociationProxy<CpkComment>;
  declare author: string;
  declare title: string;

  static _demodulizedName = "Post";
  static _tableName = "cpk_posts";

  static {
    this.hasMany("comments", {
      className: "CpkComment",
      foreignKey: ["commentable_title", "commentable_author"],
      as: "commentable",
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkComment extends Base {
  declare commentable_author: string;
  declare commentable_title: string;
  declare commentable_type: string;
  declare text: string;

  static _demodulizedName = "Comment";
  static _tableName = "cpk_comments";

  static {
    this.belongsTo("commentable", {
      className: "CpkPost",
      foreignKey: ["commentable_title", "commentable_author"],
      polymorphic: true,
    });
    this.belongsTo("post", {
      className: "CpkPost",
      foreignKey: ["commentable_title", "commentable_author"],
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkComment {
  get commentable(): Base | null | Promise<Base | null>;
  set commentable(value: Base | null);
  get post(): CpkPost | null | Promise<CpkPost | null>;
  set post(value: CpkPost | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkReview extends Base {
  declare author_id: number;
  declare comment: string;
  declare "number": number;
  declare rating: number;

  static _demodulizedName = "Review";
  static _tableName = "cpk_reviews";

  static {
    this.belongsTo("book", {
      className: "CpkBook",
      foreignKey: ["author_id", "number"],
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkReview {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

export class CpkCar extends Base {
  declare carReviews: AssociationProxy<CpkCarReview>;
  declare make: string;
  declare model: string;

  static _tableName = "cpk_cars";
  static _demodulizedName = "Car";

  static {
    this.hasMany("carReviews", {
      className: "CpkCarReview",
      foreignKey: ["car_make", "car_model"],
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkCarReview extends Base {
  declare car_make: string;
  declare car_model: string;
  declare comment: string;
  declare rating: number;

  static _tableName = "cpk_car_reviews";
  static _demodulizedName = "CarReview";

  static {
    this.belongsTo("car", { className: "CpkCar", foreignKey: ["car_make", "car_model"] });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkCarReview {
  get car(): CpkCar | null | Promise<CpkCar | null>;
  set car(value: CpkCar | null);
}
