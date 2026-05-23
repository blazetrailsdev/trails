// vendor/rails/activerecord/test/models/cpk/
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";
import { generatesTokenFor } from "../../token-for.js";

// cpk/author.rb
export class CpkAuthor extends Base {
  static _tableName = "cpk_authors";

  static {
    // Rails: dependent: :delete_all — "deleteAll" not yet in AssociationOptions.dependent type
    this.hasMany("books", { className: "CpkBook", foreignKey: "author_id", dependent: "delete" });
  }
}

// cpk/book.rb
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

// cpk/book_destroy_async.rb
export class CpkBookDestroyAsync extends Base {
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
  static _tableName = "cpk_chapters";

  static {
    this._primaryKey = ["author_id", "id"];
    this.belongsTo("book", { className: "CpkBook", foreignKey: ["author_id", "book_id"] });
  }
}

// cpk/chapter_destroy_async.rb
export class CpkChapterDestroyAsync extends Base {
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
  static _tableName = "cpk_orders";

  static {
    this._primaryKey = ["shop_id", "id"];
    this.aliasAttribute("idValue", "id");
    this.hasMany("orderAgreements", { className: "CpkOrderAgreement", foreignKey: "order_id" });
    this.hasMany("books", { className: "CpkBook", foreignKey: ["shop_id", "order_id"] });
    this.hasOne("book", { className: "CpkBook", foreignKey: ["shop_id", "order_id"] });
    this.hasMany("orderTags", { className: "CpkOrderTag", foreignKey: "order_id" });
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
    this.hasOne("book", { className: "CpkBook", foreignKey: "order_id" });
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

// cpk/order_agreement.rb
export class CpkOrderAgreement extends Base {
  static _tableName = "cpk_order_agreements";

  static {
    this.belongsTo("order", { className: "CpkOrder" });
  }
}

// cpk/order_tag.rb
export class CpkOrderTag extends Base {
  static _tableName = "cpk_order_tags";

  static {
    this.belongsTo("tag", { className: "CpkTag" });
    this.belongsTo("order", { className: "CpkOrder" });
  }
}

// cpk/tag.rb
export class CpkTag extends Base {
  static _tableName = "cpk_tags";

  static {
    this.hasMany("orderTags", { className: "CpkOrderTag", foreignKey: "tag_id" });
    this.hasMany("orders", { className: "CpkOrder", through: "orderTags" });
  }
}

// cpk/post.rb
export class CpkPost extends Base {
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
  static _tableName = "cpk_cars";

  static {
    this.hasMany("carReviews", {
      className: "CpkCarReview",
      foreignKey: ["car_make", "car_model"],
    });
  }
}

// cpk/car_review.rb
export class CpkCarReview extends Base {
  static _tableName = "cpk_car_reviews";

  static {
    this.belongsTo("car", { className: "CpkCar", foreignKey: ["car_make", "car_model"] });
  }
}
