import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Author } from "./author.js";
import type { Category } from "./category.js";
import type { Member } from "./member.js";
import type { MemberDetail } from "./member-detail.js";
import type { Post } from "./post.js";
// vendor/rails/activerecord/test/models/organization.rb
import { Base } from "../../base.js";

export class Organization extends Base {
  declare memberDetails: AssociationProxy<MemberDetail>;
  declare members: AssociationProxy<Member>;
  declare authors: AssociationProxy<Author>;
  declare authorEssayCategories: AssociationProxy<Category>;
  declare author: Author | null;
  declare authorOwnedEssayCategory: Category | null;
  declare posts: AssociationProxy<Post>;
  declare static clubs: () => Relation<Organization>;
  declare loadHasOne: ((name: "author") => Promise<Author | null>) &
    ((name: "authorOwnedEssayCategory") => Promise<Category | null>);
  declare name: string;

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
