// vendor/rails/activerecord/test/models/publisher/magazine.rb
import { Base } from "../../../base.js";

// Publisher::Magazine — see article.ts for the moduleName convention. The
// `:articles` target is left implicit so it resolves namespace-relative to
// `Publisher::Article`.
export class PublisherMagazine extends Base {
  static moduleName = "Publisher";
  static _demodulizedName = "Magazine";
  static _tableName = "magazines";

  static {
    this.hasAndBelongsToMany("articles");
  }
}
