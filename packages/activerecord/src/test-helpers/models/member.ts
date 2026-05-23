// vendor/rails/activerecord/test/models/member.rb
import { Base } from "../../base.js";

export class Member extends Base {
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
  static {
    this._tableName = "members";
    this.hasAndBelongsToMany("friends", {
      className: "SelfMember",
      joinTable: "member_friends",
    });
  }
}
