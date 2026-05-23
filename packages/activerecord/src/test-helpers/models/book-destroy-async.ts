// vendor/rails/activerecord/test/models/book_destroy_async.rb
import { Base } from "../../base.js";

// Rails uses dependent: :destroy_async; TS dependent union doesn't include it yet — using "destroy"
export class BookDestroyAsync extends Base {
  static _tableName = "books";

  static {
    this.hasMany("taggings", { as: "taggable", className: "Tagging" });
    this.hasMany("tags", { through: "taggings", dependent: "destroy" });
    this.hasMany("essays", {
      dependent: "destroy",
      className: "EssayDestroyAsync",
      foreignKey: "book_id",
    });
    this.hasOne("content", { dependent: "destroy" });
    this.enum("status", { proposed: 0, written: 1, published: 2 });
  }
}

export class BookDestroyAsyncWithScopedTags extends Base {
  static _tableName = "books";

  static {
    this.hasMany("taggings", { as: "taggable", className: "Tagging" });
    this.hasMany("tags", { through: "taggings", dependent: "destroy" });
  }
}
