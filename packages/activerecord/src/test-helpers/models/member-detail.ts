// vendor/rails/activerecord/test/models/member_detail.rb
import { Base } from "../../base.js";

export class MemberDetail extends Base {
  static {
    this.belongsTo("member", { inverseOf: false });
    this.belongsTo("organization");
    this.hasOne("memberType", { through: "member" });
    this.hasOne("membership", { through: "member" });
    this.hasOne("admittable", { through: "member", sourceType: "Member" });
    this.hasMany("organizationMemberDetails", {
      through: "organization",
      source: "memberDetails",
    });
  }
}
