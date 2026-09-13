import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Member } from "./member.js";
import type { Membership } from "./membership.js";
import type { MemberType } from "./member-type.js";
import type { Organization } from "./organization.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MemberDetail extends Base {
  declare organizationMemberDetails: AssociationProxy<MemberDetail>;
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MemberDetail {
  get member(): Member | null | Promise<Member | null>;
  set member(value: Member | null);
  get organization(): Organization | null | Promise<Organization | null>;
  set organization(value: Organization | null);
  get memberType(): MemberType | null | Promise<MemberType | null>;
  set memberType(value: MemberType | null);
  get membership(): Membership | null | Promise<Membership | null>;
  set membership(value: Membership | null);
  get admittable(): Member | null | Promise<Member | null>;
  set admittable(value: Member | null);
}
