// vendor/rails/activerecord/test/models/publisher/article.rb
import { Base } from "../../../base.js";

// Publisher::Article — carries its Ruby module path via `moduleName`/
// `_demodulizedName` so `registerModel` derives the `Publisher::Article`
// registry key. The HABTM target class names are left implicit so the
// namespace-relative resolution (`Publisher::Magazine`) is exercised, while
// `:tags` resolves cross-namespace to the top-level `Tag`.
export class PublisherArticle extends Base {
  static moduleName = "Publisher";
  static _demodulizedName = "Article";
  static _tableName = "articles";

  static {
    this.hasAndBelongsToMany("magazines");
    this.hasAndBelongsToMany("tags");
  }
}
