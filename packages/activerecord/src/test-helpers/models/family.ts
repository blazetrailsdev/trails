import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { FamilyTree } from "./family-tree.js";
import type { Member } from "./member.js";
// vendor/rails/activerecord/test/models/family.rb
import { Base } from "../../base.js";

export class Family extends Base {
  declare familyTrees: AssociationProxy<FamilyTree>;
  declare members: AssociationProxy<Member>;

  static {
    this.hasMany("familyTrees", { scope: (q: any) => q.where({ token: null }) });
    this.hasMany("members", { through: "familyTrees" });
  }
}
