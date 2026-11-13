import { DescendantsTracker } from "@blazetrails/activesupport";
import "../../lib/destroy-association-async-job.js";
import { kernelThrow, constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import { Base } from "../../lib/base.js";

export const Cpk = {};
constSet(TopLevel, "Cpk", Cpk);

export class CpkAuthor extends Base {
  declare books: AssociationProxy<CpkBook>;
  declare name: string;

  static tableName = "cpk_authors";
  static {
    constSet(Cpk, "Author", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    this.hasMany("books", {
      className: "Cpk::Book",
      foreignKey: "author_id",
      dependent: "deleteAll",
    });
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

  static tableName = "cpk_books";
  static {
    constSet(Cpk, "Book", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  declare failDestroy: boolean | undefined;

  static {
    this.primaryKey = ["author_id", "id"];
    this.belongsTo("order", {
      autosave: true,
      foreignKey: ["shop_id", "order_id"],
      counterCache: true,
    });
    this.belongsTo("orderExplicitFkPk", {
      className: "Cpk::Order",
      foreignKey: ["shop_id", "order_id"],
      primaryKey: ["shop_id", "id"],
    });
    this.belongsTo("author", { className: "Cpk::Author" });
    this.hasMany("chapters", { foreignKey: ["author_id", "book_id"] });
    this.acceptsNestedAttributesFor("chapters");
    this.beforeDestroy(function (this: CpkBook) {
      if (this.failDestroy) kernelThrow(":abort");
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

CpkBook.generatesTokenFor("test");

export class CpkBestSeller extends CpkBook {
  static {
    constSet(Cpk, "BestSeller", this);
    DescendantsTracker.registerSubclass(CpkBook, this);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBrokenBook extends CpkBook {
  static {
    constSet(Cpk, "BrokenBook", this);
    DescendantsTracker.registerSubclass(CpkBook, this);
  }
  static {
    this.belongsTo("order", { className: "Cpk::OrderWithSpecialPrimaryKey" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBrokenBook {
  get order(): CpkOrderWithSpecialPrimaryKey | null | Promise<CpkOrderWithSpecialPrimaryKey | null>;
  set order(value: CpkOrderWithSpecialPrimaryKey | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBrokenBookWithNonCpkOrder extends CpkBook {
  static {
    constSet(Cpk, "BrokenBookWithNonCpkOrder", this);
    DescendantsTracker.registerSubclass(CpkBook, this);
  }
  static {
    this.belongsTo("order", {
      className: "Cpk::NonCpkOrder",
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
  static {
    constSet(Cpk, "NonCpkBook", this);
    DescendantsTracker.registerSubclass(CpkBook, this);
  }
  static {
    this.primaryKey = "id";
    this.belongsTo("nonCpkOrder", { foreignKey: ["order_id"] });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkNonCpkBook {
  get nonCpkOrder(): CpkNonCpkOrder | null | Promise<CpkNonCpkOrder | null>;
  set nonCpkOrder(value: CpkNonCpkOrder | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkNullifiedBook extends CpkBook {
  static {
    constSet(Cpk, "NullifiedBook", this);
    DescendantsTracker.registerSubclass(CpkBook, this);
  }
  static {
    this.hasOne("chapter", {
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

  static {
    constSet(Cpk, "BookWithOrderAgreements", this);
    DescendantsTracker.registerSubclass(CpkBook, this);
  }
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

  static {
    constSet(Cpk, "BookDestroyAsync", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_books";

  static {
    this.hasMany("chapters", {
      foreignKey: ["author_id", "book_id"],
      className: "Cpk::ChapterDestroyAsync",
      dependent: "destroyAsync",
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkChapter extends Base {
  declare author_id: number;
  declare book_id: number;
  declare title: string;

  static {
    constSet(Cpk, "Chapter", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_chapters";

  static {
    this.primaryKey = ["author_id", "id"];
    this.belongsTo("book", { foreignKey: ["author_id", "book_id"] });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkChapter {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkChapterDestroyAsync extends Base {
  static {
    constSet(Cpk, "ChapterDestroyAsync", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_chapters";

  static {
    this.primaryKey = ["author_id", "id"];
    this.belongsTo("book", {
      foreignKey: ["author_id", "book_id"],
      className: "Cpk::BookDestroyAsync",
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

  static tableName = "cpk_orders";
  static {
    constSet(Cpk, "Order", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    this.primaryKey = ["shop_id", "id"];
    this.aliasAttribute("id_value", "id");
    this.hasMany("orderAgreements", {
      foreignKey: "order_id",
    });
    this.hasMany("books", { foreignKey: ["shop_id", "order_id"] });
    this.hasOne("book", { foreignKey: ["shop_id", "order_id"] });
    this.hasMany("orderTags", {
      foreignKey: "order_id",
    });
    this.hasMany("tags", { through: "orderTags" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrder {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBrokenOrder extends CpkOrder {
  static {
    constSet(Cpk, "BrokenOrder", this);
    DescendantsTracker.registerSubclass(CpkOrder, this);
  }
  static {
    this.primaryKey = ["shop_id", "status"];
    this.hasMany("books");
    this.hasOne("book");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBrokenOrder {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderWithSpecialPrimaryKey extends CpkOrder {
  static {
    constSet(Cpk, "OrderWithSpecialPrimaryKey", this);
    DescendantsTracker.registerSubclass(CpkOrder, this);
  }
  static {
    this.primaryKey = ["shop_id", "status"];
    this.hasMany("books", { foreignKey: ["shop_id", "status"] });
    this.hasOne("book", { foreignKey: ["shop_id", "status"] });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrderWithSpecialPrimaryKey {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkBrokenOrderWithNonCpkBooks extends CpkOrder {
  static {
    constSet(Cpk, "BrokenOrderWithNonCpkBooks", this);
    DescendantsTracker.registerSubclass(CpkOrder, this);
  }
  static {
    this.primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "Cpk::NonCpkBook" });
    this.hasOne("book", { className: "Cpk::NonCpkBook" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkBrokenOrderWithNonCpkBooks {
  get book(): CpkNonCpkBook | null | Promise<CpkNonCpkBook | null>;
  set book(value: CpkNonCpkBook | null);
}

export class CpkNonCpkOrder extends CpkOrder {
  static {
    constSet(Cpk, "NonCpkOrder", this);
    DescendantsTracker.registerSubclass(CpkOrder, this);
  }
  static {
    this.primaryKey = "id";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderWithPrimaryKeyAssociatedBook extends CpkOrder {
  static {
    constSet(Cpk, "OrderWithPrimaryKeyAssociatedBook", this);
    DescendantsTracker.registerSubclass(CpkOrder, this);
  }
  static {
    this.hasOne("book", { foreignKey: "order_id" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkOrderWithPrimaryKeyAssociatedBook {
  get book(): CpkBook | null | Promise<CpkBook | null>;
  set book(value: CpkBook | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderWithNullifiedBook extends CpkOrder {
  static {
    constSet(Cpk, "OrderWithNullifiedBook", this);
    DescendantsTracker.registerSubclass(CpkOrder, this);
  }
  static {
    this.hasOne("book", {
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

  static {
    constSet(Cpk, "OrderWithSingularBookChapters", this);
    DescendantsTracker.registerSubclass(CpkOrder, this);
  }
  static {
    this.hasMany("chapters", { through: "book" });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CpkOrderAgreement extends Base {
  declare order_id: number;
  declare signature: string;

  static {
    constSet(Cpk, "OrderAgreement", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_order_agreements";

  static {
    this.belongsTo("order");
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

  static {
    constSet(Cpk, "OrderTag", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_order_tags";
  static {
    this.primaryKey = ["order_id", "tag_id"];
  }

  static {
    this.belongsTo("tag");
    this.belongsTo("order");
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

  static {
    constSet(Cpk, "Tag", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_tags";

  static {
    this.hasMany("orderTags", { foreignKey: "tag_id" });
    this.hasMany("orders", { through: "orderTags" });
  }
}

export class CpkPost extends Base {
  declare comments: AssociationProxy<CpkComment>;
  declare author: string;
  declare title: string;

  static {
    constSet(Cpk, "Post", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_posts";

  static {
    this.hasMany("comments", {
      className: "Cpk::Comment",
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

  static {
    constSet(Cpk, "Comment", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_comments";

  static {
    this.belongsTo("commentable", {
      className: "Cpk::Post",
      foreignKey: ["commentable_title", "commentable_author"],
      polymorphic: true,
    });
    this.belongsTo("post", {
      className: "Cpk::Post",
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

  static {
    constSet(Cpk, "Review", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static tableName = "cpk_reviews";

  static {
    this.belongsTo("book", {
      className: "Cpk::Book",
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

  static tableName = "cpk_cars";
  static {
    constSet(Cpk, "Car", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    this.hasMany("carReviews", {
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

  static tableName = "cpk_car_reviews";
  static {
    constSet(Cpk, "CarReview", this);
    DescendantsTracker.registerSubclass(Base, this);
  }

  static {
    this.belongsTo("car", { foreignKey: ["car_make", "car_model"] });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CpkCarReview {
  get car(): CpkCar | null | Promise<CpkCar | null>;
  set car(value: CpkCar | null);
}
