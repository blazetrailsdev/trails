import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Content } from "./content.js";
import type { EssayDestroyAsync } from "./essay-destroy-async.js";
import type { Tag } from "./tag.js";
import type { Tagging } from "./tagging.js";
// vendor/rails/activerecord/test/models/book_destroy_async.rb
// Rails uses dependent: :destroy_async. The runtime accepts "destroyAsync" but
// AssociationOptions.dependent type union doesn't include it yet; using "destroy" until the type is widened.
import { Base } from "../../base.js";

export class BookDestroyAsync extends Base {
  declare taggings: AssociationProxy<Tagging>;
  declare tags: AssociationProxy<Tag>;
  declare essays: AssociationProxy<EssayDestroyAsync>;
  declare content: Content | null;
  declare isProposed: () => boolean;
  declare proposedBang: () => Promise<true>;
  declare static proposed: () => Relation<BookDestroyAsync>;
  declare static notProposed: () => Relation<BookDestroyAsync>;
  declare isWritten: () => boolean;
  declare writtenBang: () => Promise<true>;
  declare static written: () => Relation<BookDestroyAsync>;
  declare static notWritten: () => Relation<BookDestroyAsync>;
  declare isPublished: () => boolean;
  declare publishedBang: () => Promise<true>;
  declare static published: () => Relation<BookDestroyAsync>;
  declare static notPublished: () => Relation<BookDestroyAsync>;
  declare loadHasOne: (name: "content") => Promise<Content | null>;

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
  declare taggings: AssociationProxy<Tagging>;
  declare tags: AssociationProxy<Tag>;

  static _tableName = "books";

  static {
    this.hasMany("taggings", { as: "taggable", className: "Tagging" });
    this.hasMany("tags", { through: "taggings", dependent: "destroy" });
  }
}
