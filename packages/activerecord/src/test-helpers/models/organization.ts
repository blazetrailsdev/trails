// vendor/rails/activerecord/test/models/organization.rb
import { Base } from "../../base.js";

export class Organization extends Base {
  static {
    this.hasMany("memberDetails");
    this.hasMany("members", { through: "memberDetails" });

    this.hasMany("authors", { primaryKey: "name" });
    this.hasMany("authorEssayCategories", { through: "authors", source: "essayCategories" });

    this.hasOne("author", { primaryKey: "name" });
    this.hasOne("authorOwnedEssayCategory", { through: "author", source: "ownedEssayCategory" });

    this.hasMany("posts", { through: "author", source: "posts" });

    this.scope("clubs", (q: any) => q.from("clubs"));
  }
}
