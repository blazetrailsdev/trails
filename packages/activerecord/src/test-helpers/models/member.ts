import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Category } from "./category.js";
import type { Club } from "./club.js";
import type { CurrentMembership } from "./membership.js";
import type { MemberDetail } from "./member-detail.js";
import type { Membership } from "./membership.js";
import type { MemberType } from "./member-type.js";
import type { Organization } from "./organization.js";
import type { SelectedMembership } from "./membership.js";
import type { Sponsor } from "./sponsor.js";
import type { SuperMembership } from "./membership.js";
import type { TenantMembership } from "./membership.js";
import { Base } from "../../base.js";

export class Member extends Base {
  declare nestedMemberTypes: AssociationProxy<MemberType>;
  declare nestedSponsors: AssociationProxy<Sponsor>;
  declare organizationMemberDetails: AssociationProxy<MemberDetail>;
  declare organizationMemberDetails_2: AssociationProxy<MemberDetail>;
  declare superMemberships: AssociationProxy<SuperMembership>;
  declare favoriteMemberships: AssociationProxy<Membership>;
  declare clubs: AssociationProxy<Club>;
  declare tenantMemberships: AssociationProxy<TenantMembership>;
  declare tenantClubs: AssociationProxy<Club>;
  declare static unnamed: () => Relation<Member>;
  declare static withMemberTypeId: (id: number) => Relation<Member>;
  declare admittable_id: number;
  declare admittable_type: string;
  declare member_type_id: number;
  declare name: string;

  static {
    this.hasOne("currentMembership");
    this.hasOne("selectedMembership");
    this.hasOne("membership");
    this.hasOne("club", { through: "currentMembership" });
    this.hasOne("clubWithoutJoins", {
      through: "currentMembership",
      source: "club",
      disableJoins: true,
    });
    this.hasOne("selectedClub", { through: "selectedMembership", source: "club" });
    this.hasOne("favoriteClub", (q: any) => q.where("memberships.favorite = ?", true), {
      through: "membership",
      source: "club",
    });
    this.hasOne(
      "hairyClub",
      (q: any) => q.where({ clubs: { name: "Moustache and Eyebrow Fancier Club" } }),
      { through: "membership", source: "club" },
    );
    this.hasOne("sponsor", { as: "sponsorable" });
    this.hasOne("sponsorClub", { through: "sponsor" });
    this.hasOne("memberDetail", { inverseOf: false });
    this.hasOne("organization", { through: "memberDetail" });
    this.hasOne("organizationWithoutJoins", {
      through: "memberDetail",
      disableJoins: true,
      source: "organization",
    });
    this.belongsTo("memberType");

    this.hasMany("nestedMemberTypes", { through: "memberDetail", source: "memberType" });
    this.hasOne("nestedMemberType", { through: "memberDetail", source: "memberType" });

    this.hasMany("nestedSponsors", { through: "sponsorClub", source: "sponsor" });
    this.hasOne("nestedSponsor", { through: "sponsorClub", source: "sponsor" });

    this.hasMany("organizationMemberDetails", { through: "memberDetail" });
    this.hasMany("organizationMemberDetails_2", {
      through: "organization",
      source: "memberDetails",
    });

    this.hasOne("clubCategory", { through: "club", source: "category" });
    this.hasOne("generalClub", (q: any) => q.general(), {
      through: "currentMembership",
      source: "club",
    });

    this.hasMany("superMemberships");
    this.hasMany("favoriteMemberships", (q: any) => q.where({ favorite: true }), {
      className: "Membership",
    });
    this.hasMany("clubs", { through: "favoriteMemberships" });

    this.hasMany("tenantMemberships");
    this.hasMany("tenantClubs", {
      through: "tenantMemberships",
      className: "Club",
      source: "club",
    });

    this.hasOne("clubThroughMany", { through: "favoriteMemberships", source: "club" });

    this.belongsTo("admittable", { polymorphic: true });
    this.hasOne("premiumClub", { through: "admittable" });

    this.scope("unnamed", function (this: any) {
      return this.where({ name: null });
    });
    this.scope("withMemberTypeId", function (this: any, id: number) {
      return this.where({ member_type_id: id });
    });
  }
}
export interface Member {
  get currentMembership(): CurrentMembership | null | Promise<CurrentMembership | null>;
  set currentMembership(value: CurrentMembership | null);
  get selectedMembership(): SelectedMembership | null | Promise<SelectedMembership | null>;
  set selectedMembership(value: SelectedMembership | null);
  get membership(): Membership | null | Promise<Membership | null>;
  set membership(value: Membership | null);
  get club(): Club | null | Promise<Club | null>;
  set club(value: Club | null);
  get clubWithoutJoins(): Club | null | Promise<Club | null>;
  set clubWithoutJoins(value: Club | null);
  get selectedClub(): Club | null | Promise<Club | null>;
  set selectedClub(value: Club | null);
  get favoriteClub(): Club | null | Promise<Club | null>;
  set favoriteClub(value: Club | null);
  get hairyClub(): Club | null | Promise<Club | null>;
  set hairyClub(value: Club | null);
  get sponsor(): Sponsor | null | Promise<Sponsor | null>;
  set sponsor(value: Sponsor | null);
  get sponsorClub(): Club | null | Promise<Club | null>;
  set sponsorClub(value: Club | null);
  get memberDetail(): MemberDetail | null | Promise<MemberDetail | null>;
  set memberDetail(value: MemberDetail | null);
  get organization(): Organization | null | Promise<Organization | null>;
  set organization(value: Organization | null);
  get organizationWithoutJoins(): Organization | null | Promise<Organization | null>;
  set organizationWithoutJoins(value: Organization | null);
  get memberType(): MemberType | null | Promise<MemberType | null>;
  set memberType(value: MemberType | null);
  get nestedMemberType(): MemberType | null | Promise<MemberType | null>;
  set nestedMemberType(value: MemberType | null);
  get nestedSponsor(): Sponsor | null | Promise<Sponsor | null>;
  set nestedSponsor(value: Sponsor | null);
  get clubCategory(): Category | null | Promise<Category | null>;
  set clubCategory(value: Category | null);
  get generalClub(): Club | null | Promise<Club | null>;
  set generalClub(value: Club | null);
  get clubThroughMany(): Club | null | Promise<Club | null>;
  set clubThroughMany(value: Club | null);
  get admittable(): Base | null | Promise<Base | null>;
  set admittable(value: Base | null);
  get premiumClub(): Base | null | Promise<Base | null>;
  set premiumClub(value: Base | null);
}

export class SelfMember extends Base {
  declare friends: AssociationProxy<SelfMember>;

  static {
    this._tableName = "members";
    this.hasAndBelongsToMany("friends", {
      className: "SelfMember",
      joinTable: "member_friends",
    });
  }
}
