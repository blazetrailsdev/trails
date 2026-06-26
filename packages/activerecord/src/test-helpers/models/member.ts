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
// vendor/rails/activerecord/test/models/member.rb
import { Base } from "../../base.js";

export class Member extends Base {
  declare currentMembership: CurrentMembership | null;
  declare selectedMembership: SelectedMembership | null;
  declare membership: Membership | null;
  declare club: Club | null;
  declare clubWithoutJoins: Club | null;
  declare selectedClub: Base | null;
  declare favoriteClub: Club | null;
  declare hairyClub: Club | null;
  declare sponsor: Sponsor | null;
  declare sponsorClub: Club | null;
  declare memberDetail: MemberDetail | null;
  declare organization: Organization | null;
  declare organizationWithoutJoins: Organization | null;
  declare memberType: MemberType | null;
  declare nestedMemberTypes: AssociationProxy<MemberType>;
  declare nestedMemberType: MemberType | null;
  declare nestedSponsors: AssociationProxy<Sponsor>;
  declare nestedSponsor: Sponsor | null;
  declare organizationMemberDetails: AssociationProxy<MemberDetail>;
  declare organizationMemberDetails_2: AssociationProxy<MemberDetail>;
  declare clubCategory: Category | null;
  declare generalClub: Club | null;
  declare superMemberships: AssociationProxy<SuperMembership>;
  declare favoriteMemberships: AssociationProxy<Membership>;
  declare clubs: AssociationProxy<Club>;
  declare tenantMemberships: AssociationProxy<TenantMembership>;
  declare tenantClubs: AssociationProxy<Club>;
  declare clubThroughMany: Club | null;
  declare admittable: Base | null;
  declare premiumClub: Base | null;
  declare static unnamed: () => Relation<Member>;
  declare static withMemberTypeId: (id: number) => Relation<Member>;
  declare loadBelongsTo: ((name: "memberType") => Promise<MemberType | null>) &
    ((name: "admittable") => Promise<Base | null>);
  declare loadHasOne: ((name: "currentMembership") => Promise<CurrentMembership | null>) &
    ((name: "selectedMembership") => Promise<SelectedMembership | null>) &
    ((name: "membership") => Promise<Membership | null>) &
    ((name: "club") => Promise<Club | null>) &
    ((name: "clubWithoutJoins") => Promise<Club | null>) &
    ((name: "selectedClub") => Promise<Base | null>) &
    ((name: "favoriteClub") => Promise<Club | null>) &
    ((name: "hairyClub") => Promise<Club | null>) &
    ((name: "sponsor") => Promise<Sponsor | null>) &
    ((name: "sponsorClub") => Promise<Club | null>) &
    ((name: "memberDetail") => Promise<MemberDetail | null>) &
    ((name: "organization") => Promise<Organization | null>) &
    ((name: "organizationWithoutJoins") => Promise<Organization | null>) &
    ((name: "nestedMemberType") => Promise<MemberType | null>) &
    ((name: "nestedSponsor") => Promise<Sponsor | null>) &
    ((name: "clubCategory") => Promise<Category | null>) &
    ((name: "generalClub") => Promise<Club | null>) &
    ((name: "clubThroughMany") => Promise<Club | null>) &
    ((name: "premiumClub") => Promise<Base | null>);
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
    this.hasOne("favoriteClub", {
      scope: (q: any) => q.where("memberships.favorite = ?", true),
      through: "membership",
      source: "club",
    });
    this.hasOne("hairyClub", {
      scope: (q: any) => q.where({ clubs: { name: "Moustache and Eyebrow Fancier Club" } }),
      through: "membership",
      source: "club",
    });
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
    this.hasOne("generalClub", {
      scope: (q: any) => q.general(),
      through: "currentMembership",
      source: "club",
    });

    this.hasMany("superMemberships");
    this.hasMany("favoriteMemberships", {
      scope: (q: any) => q.where({ favorite: true }),
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

    this.scope("unnamed", (q: any) => q.where({ name: null }));
    this.scope("withMemberTypeId", (q: any, id: number) => q.where({ member_type_id: id }));
  }
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
