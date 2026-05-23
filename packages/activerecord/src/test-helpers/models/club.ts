// vendor/rails/activerecord/test/models/club.rb
import { Base } from "../../base.js";

export class Club extends Base {
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
  static {
    this._tableName = "clubs";
    this.hasMany("memberships", { className: "SuperMembership", foreignKey: "club_id" });
    this.hasMany("members", { through: "memberships" });
  }
}
