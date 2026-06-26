import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Member } from "./member.js";
import type { Membership } from "./membership.js";
import type { MemberType } from "./member-type.js";
import type { Organization } from "./organization.js";
// vendor/rails/activerecord/test/models/member_detail.rb
import { Base } from "../../base.js";

export class MemberDetail extends Base {
  declare member: Member | null;
  declare organization: Organization | null;
  declare memberType: MemberType | null;
  declare membership: Membership | null;
  declare admittable: Member | null;
  declare organizationMemberDetails: AssociationProxy<MemberDetail>;
  declare loadBelongsTo: ((name: "member") => Promise<Member | null>) &
    ((name: "organization") => Promise<Organization | null>);
  declare loadHasOne: ((name: "memberType") => Promise<MemberType | null>) &
    ((name: "membership") => Promise<Membership | null>) &
    ((name: "admittable") => Promise<Member | null>);
  declare extra_data: string;
  declare member_id: number;
  declare organization_id: number;

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
