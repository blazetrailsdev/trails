import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { throwAbort } from "@blazetrails/activesupport";
// vendor/rails/activerecord/test/models/cpk/
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";
import { generatesTokenFor } from "../../token-for.js";

// cpk/author.rb
export class CpkAuthor extends Base {
  declare books: AssociationProxy<CpkBook>;
  declare name: string;

  static _tableName = "cpk_authors";
  static _demodulizedName = "Author";

  static {
    // Rails: dependent: :delete_all — "deleteAll" not yet in AssociationOptions.dependent type
    this.hasMany("books", { className: "CpkBook", foreignKey: "author_id", dependent: "delete" });
  }
}

// cpk/book.rb
export class CpkBook extends Base {
  declare order: CpkOrder | null;
  declare orderExplicitFkPk: CpkOrder | null;
  declare author: CpkAuthor | null;
  declare chapters: AssociationProxy<CpkChapter>;
  declare loadBelongsTo: ((name: "order") => Promise<CpkOrder | null>) &
    ((name: "orderExplicitFkPk") => Promise<CpkOrder | null>) &
    ((name: "author") => Promise<CpkAuthor | null>);
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

acceptsNestedAttributesFor(CpkBook, "chapters");
generatesTokenFor(CpkBook, "test");

export class CpkBestSeller extends CpkBook {
  declare loadBelongsTo: ((name: "order") => Promise<CpkOrder | null>) &
    ((name: "orderExplicitFkPk") => Promise<CpkOrder | null>) &
    ((name: "author") => Promise<CpkAuthor | null>);

  static _demodulizedName = "BestSeller";
}

export class CpkBrokenBook extends CpkBook {
  declare order: CpkOrderWithSpecialPrimaryKey | null;
  declare loadBelongsTo: ((name: "order") => Promise<CpkOrder | null>) &
    ((name: "orderExplicitFkPk") => Promise<CpkOrder | null>) &
    ((name: "author") => Promise<CpkAuthor | null>) &
    ((name: "order") => Promise<CpkOrderWithSpecialPrimaryKey | null>);

  static _demodulizedName = "BrokenBook";
  static {
    this.belongsTo("order", { className: "CpkOrderWithSpecialPrimaryKey" });
  }
}

export class CpkBrokenBookWithNonCpkOrder extends CpkBook {
  declare order: CpkNonCpkOrder | null;
  declare loadBelongsTo: ((name: "order") => Promise<CpkOrder | null>) &
    ((name: "orderExplicitFkPk") => Promise<CpkOrder | null>) &
    ((name: "author") => Promise<CpkAuthor | null>) &
    ((name: "order") => Promise<CpkNonCpkOrder | null>);

  static _demodulizedName = "BrokenBookWithNonCpkOrder";
  static {
    this.belongsTo("order", {
      className: "CpkNonCpkOrder",
      foreignKey: ["shop_id", "order_id"],
    });
  }
}

export class CpkNonCpkBook extends CpkBook {
  declare nonCpkOrder: CpkNonCpkOrder | null;
  declare loadBelongsTo: ((name: "order") => Promise<CpkOrder | null>) &
    ((name: "orderExplicitFkPk") => Promise<CpkOrder | null>) &
    ((name: "author") => Promise<CpkAuthor | null>) &
    ((name: "nonCpkOrder") => Promise<CpkNonCpkOrder | null>);

  static _demodulizedName = "NonCpkBook";
  static {
    this._primaryKey = "id";
    this.belongsTo("nonCpkOrder", { className: "CpkNonCpkOrder", foreignKey: ["order_id"] });
  }
}

export class CpkNullifiedBook extends CpkBook {
  declare chapter: CpkChapter | null;
  declare loadBelongsTo: ((name: "order") => Promise<CpkOrder | null>) &
    ((name: "orderExplicitFkPk") => Promise<CpkOrder | null>) &
    ((name: "author") => Promise<CpkAuthor | null>);
  declare loadHasOne: (name: "chapter") => Promise<CpkChapter | null>;

  static _demodulizedName = "NullifiedBook";
  static {
    this.hasOne("chapter", {
      className: "CpkChapter",
      foreignKey: ["author_id", "book_id"],
      dependent: "nullify",
    });
  }
}

export class CpkBookWithOrderAgreements extends CpkBook {
  declare orderAgreements: AssociationProxy<CpkOrderAgreement>;
  declare orderAgreement: CpkOrderAgreement | null;
  declare loadBelongsTo: ((name: "order") => Promise<CpkOrder | null>) &
    ((name: "orderExplicitFkPk") => Promise<CpkOrder | null>) &
    ((name: "author") => Promise<CpkAuthor | null>);
  declare loadHasOne: (name: "orderAgreement") => Promise<CpkOrderAgreement | null>;

  static _demodulizedName = "BookWithOrderAgreements";
  static {
    this.hasMany("orderAgreements", { through: "order" });
    this.hasOne("orderAgreement", { through: "order", source: "orderAgreements" });
  }
}

// cpk/book_destroy_async.rb
export class CpkBookDestroyAsync extends Base {
  declare chapters: AssociationProxy<CpkChapterDestroyAsync>;

  static _demodulizedName = "BookDestroyAsync";
  static _tableName = "cpk_books";

  static {
    // Rails: dependent: :destroy_async — not yet in AssociationOptions.dependent type
    this.hasMany("chapters", {
      foreignKey: ["author_id", "book_id"],
      className: "CpkChapterDestroyAsync",
      dependent: "destroy",
    });
  }
}

// cpk/chapter.rb
export class CpkChapter extends Base {
  declare book: CpkBook | null;
  declare loadBelongsTo: (name: "book") => Promise<CpkBook | null>;
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

// cpk/chapter_destroy_async.rb
export class CpkChapterDestroyAsync extends Base {
  declare book: CpkBookDestroyAsync | null;
  declare loadBelongsTo: (name: "book") => Promise<CpkBookDestroyAsync | null>;

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

// cpk/order.rb
export class CpkOrder extends Base {
  declare orderAgreements: AssociationProxy<CpkOrderAgreement>;
  declare books: AssociationProxy<CpkBook>;
  declare book: CpkBook | null;
  declare orderTags: AssociationProxy<CpkOrderTag>;
  declare tags: AssociationProxy<CpkTag>;
  declare loadHasOne: (name: "book") => Promise<CpkBook | null>;
  declare books_count: number | null;
  declare shop_id: number;
  declare status: string;

  static _tableName = "cpk_orders";
  static _demodulizedName = "Order";

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
  declare book: CpkBook | null;
  declare loadHasOne: (name: "book") => Promise<CpkBook | null>;

  static _demodulizedName = "BrokenOrder";
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkBook" });
    this.hasOne("book", { className: "CpkBook" });
  }
}

export class CpkOrderWithSpecialPrimaryKey extends CpkOrder {
  declare book: CpkBook | null;
  declare loadHasOne: (name: "book") => Promise<CpkBook | null>;

  static _demodulizedName = "OrderWithSpecialPrimaryKey";
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkBook", foreignKey: ["shop_id", "status"] });
    this.hasOne("book", { className: "CpkBook", foreignKey: ["shop_id", "status"] });
  }
}

export class CpkBrokenOrderWithNonCpkBooks extends CpkOrder {
  declare book: CpkNonCpkBook | null;
  declare loadHasOne: ((name: "book") => Promise<CpkBook | null>) &
    ((name: "book") => Promise<CpkNonCpkBook | null>);

  static _demodulizedName = "BrokenOrderWithNonCpkBooks";
  static {
    this._primaryKey = ["shop_id", "status"];
    this.hasMany("books", { className: "CpkNonCpkBook" });
    this.hasOne("book", { className: "CpkNonCpkBook" });
  }
}

export class CpkNonCpkOrder extends CpkOrder {
  declare loadHasOne: (name: "book") => Promise<CpkBook | null>;

  static _demodulizedName = "NonCpkOrder";
  static {
    this._primaryKey = "id";
  }
}

export class CpkOrderWithPrimaryKeyAssociatedBook extends CpkOrder {
  declare book: CpkBook | null;
  declare loadHasOne: (name: "book") => Promise<CpkBook | null>;

  static _demodulizedName = "OrderWithPrimaryKeyAssociatedBook";
  static {
    this.hasOne("book", { className: "CpkBook", foreignKey: "order_id", primaryKey: "id" });
  }
}

export class CpkOrderWithNullifiedBook extends CpkOrder {
  declare book: CpkBook | null;
  declare loadHasOne: (name: "book") => Promise<CpkBook | null>;

  static _demodulizedName = "OrderWithNullifiedBook";
  static {
    this.hasOne("book", {
      className: "CpkBook",
      foreignKey: ["shop_id", "order_id"],
      dependent: "nullify",
    });
  }
}

export class CpkOrderWithSingularBookChapters extends CpkOrder {
  declare chapters: AssociationProxy<CpkChapter>;
  declare loadHasOne: (name: "book") => Promise<CpkBook | null>;

  static _demodulizedName = "OrderWithSingularBookChapters";
  static {
    this.hasMany("chapters", { className: "CpkChapter", through: "book" });
  }
}

// cpk/order_agreement.rb
export class CpkOrderAgreement extends Base {
  declare order: CpkOrder | null;
  declare loadBelongsTo: (name: "order") => Promise<CpkOrder | null>;
  declare order_id: number;
  declare signature: string;

  static _demodulizedName = "OrderAgreement";
  static _tableName = "cpk_order_agreements";

  static {
    this.belongsTo("order", { className: "CpkOrder", primaryKey: "id" });
  }
}

// cpk/order_tag.rb
export class CpkOrderTag extends Base {
  declare tag: CpkTag | null;
  declare order: CpkOrder | null;
  declare loadBelongsTo: ((name: "tag") => Promise<CpkTag | null>) &
    ((name: "order") => Promise<CpkOrder | null>);
  declare attached_by: string;
  declare attached_reason: string;
  declare order_id: number;
  declare tag_id: number;

  static _demodulizedName = "OrderTag";
  static _tableName = "cpk_order_tags";
  static _primaryKey = ["order_id", "tag_id"];

  static {
    this.belongsTo("tag", { className: "CpkTag" });
    this.belongsTo("order", { className: "CpkOrder", primaryKey: "id" });
  }
}

// cpk/tag.rb
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

// cpk/post.rb
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

// cpk/comment.rb
export class CpkComment extends Base {
  declare commentable: Base | null;
  declare post: CpkPost | null;
  declare loadBelongsTo: ((name: "commentable") => Promise<Base | null>) &
    ((name: "post") => Promise<CpkPost | null>);
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

// cpk/review.rb
export class CpkReview extends Base {
  declare book: CpkBook | null;
  declare loadBelongsTo: (name: "book") => Promise<CpkBook | null>;
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

// cpk/car.rb
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

// cpk/car_review.rb
export class CpkCarReview extends Base {
  declare car: CpkCar | null;
  declare loadBelongsTo: (name: "car") => Promise<CpkCar | null>;
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
