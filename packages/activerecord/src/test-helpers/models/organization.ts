import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Author } from "./author.js";
import type { Category } from "./category.js";
import type { Member } from "./member.js";
import type { MemberDetail } from "./member-detail.js";
import type { Post } from "./post.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Organization extends Base {
  declare memberDetails: AssociationProxy<MemberDetail>;
  declare members: AssociationProxy<Member>;
  declare authors: AssociationProxy<Author>;
  declare authorEssayCategories: AssociationProxy<Category>;
  declare posts: AssociationProxy<Post>;
  declare static clubs: () => Relation<Organization>;
  declare name: string;

  static {
    this.hasMany("memberDetails");
    this.hasMany("members", { through: "memberDetails" });

    this.hasMany("authors", { primaryKey: "name" });
    this.hasMany("authorEssayCategories", { through: "authors", source: "essayCategories" });

    this.hasOne("author", { primaryKey: "name" });
    this.hasOne("authorOwnedEssayCategory", { through: "author", source: "ownedEssayCategory" });

    this.hasMany("posts", { through: "author", source: "posts" });

    this.scope("clubs", function () {
      return this.from("clubs");
    });
  }
}
registerModel(Organization);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Organization {
  get author(): Author | null | Promise<Author | null>;
  set author(value: Author | null);
  get authorOwnedEssayCategory(): Category | null | Promise<Category | null>;
  set authorOwnedEssayCategory(value: Category | null);
}
