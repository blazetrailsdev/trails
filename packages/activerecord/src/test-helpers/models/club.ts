import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Category } from "./category.js";
import type { Member } from "./member.js";
import type { Membership } from "./membership.js";
import type { Sponsor } from "./sponsor.js";
import type { SuperMembership } from "./membership.js";
// vendor/rails/activerecord/test/models/club.rb
import { Base } from "../../base.js";

export class Club extends Base {
  declare membership: Membership | null;
  declare memberships: AssociationProxy<Membership>;
  declare members: AssociationProxy<Member>;
  declare sponsor: Sponsor | null;
  declare sponsoredMember: Member | null;
  declare category: Category | null;
  declare favorites: AssociationProxy<Member>;
  declare customMemberships: AssociationProxy<Membership>;
  declare customFavorites: AssociationProxy<Member>;
  declare static general: () => Relation<Club>;
  declare loadBelongsTo: (name: "category") => Promise<Category | null>;
  declare loadHasOne: ((name: "membership") => Promise<Membership | null>) &
    ((name: "sponsor") => Promise<Sponsor | null>) &
    ((name: "sponsoredMember") => Promise<Member | null>);
  declare category_id: number;
  declare name: string;

  static {
    this.hasOne("membership", { touch: true });
    this.hasMany("memberships", { inverseOf: false });
    this.hasMany("members", { through: "memberships" });
    this.hasOne("sponsor");
    this.hasOne("sponsoredMember", {
      through: "sponsor",
      source: "sponsorable",
      sourceType: "Member",
    });
    this.belongsTo("category");

    this.hasMany("favorites", {
      scope: (q: any) => q.where({ memberships: { favorite: true } }),
      through: "memberships",
      source: "member",
    });

    this.hasMany("customMemberships", { className: "Membership" });
    this.hasMany("customFavorites", {
      scope: (q: any) => q.where({ memberships: { favorite: true } }),
      through: "customMemberships",
      source: "member",
    });

    this.scope("general", (q: any) =>
      q
        .leftJoins("category")
        .where({ categories: { name: "General" } })
        .unscope("limit"),
    );
  }
}

export class SuperClub extends Base {
  declare memberships: AssociationProxy<SuperMembership>;
  declare members: AssociationProxy<Member>;

  static {
    this._tableName = "clubs";
    this.hasMany("memberships", { className: "SuperMembership", foreignKey: "club_id" });
    this.hasMany("members", { through: "memberships" });
  }
}
