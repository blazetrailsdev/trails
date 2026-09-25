import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Category } from "./category.js";
import type { Member } from "./member.js";
import type { Membership } from "./membership.js";
import type { Sponsor } from "./sponsor.js";
import type { SuperMembership } from "./membership.js";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Club extends Base {
  declare memberships: AssociationProxy<Membership>;
  declare members: AssociationProxy<Member>;
  declare favorites: AssociationProxy<Member>;
  declare customMemberships: AssociationProxy<Membership>;
  declare customFavorites: AssociationProxy<Member>;
  declare static general: () => Relation<Club>;
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

    this.hasMany("favorites", (q: any) => q.where({ memberships: { favorite: true } }), {
      through: "memberships",
      source: "member",
    });

    this.hasMany("customMemberships", { className: "Membership" });
    this.hasMany("customFavorites", (q: any) => q.where({ memberships: { favorite: true } }), {
      through: "customMemberships",
      source: "member",
    });

    this.scope("general", function (this: any) {
      return this.leftJoins(":category")
        .where({ categories: { name: "General" } })
        .unscope(":limit");
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Club {
  get membership(): Membership | null | Promise<Membership | null>;
  set membership(value: Membership | null);
  get sponsor(): Sponsor | null | Promise<Sponsor | null>;
  set sponsor(value: Sponsor | null);
  get sponsoredMember(): Member | null | Promise<Member | null>;
  set sponsoredMember(value: Member | null);
  get category(): Category | null | Promise<Category | null>;
  set category(value: Category | null);
}

acceptsNestedAttributesFor(Club, "membership");

export class SuperClub extends Base {
  declare memberships: AssociationProxy<SuperMembership>;
  declare members: AssociationProxy<Member>;

  static {
    this._tableName = "clubs";
    this.hasMany("memberships", { className: "SuperMembership", foreignKey: "club_id" });
    this.hasMany("members", { through: "memberships" });
  }
}
