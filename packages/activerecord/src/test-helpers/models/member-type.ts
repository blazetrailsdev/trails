import { registerConstant } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Member } from "./member.js";
import { Base } from "../../base.js";

export class MemberType extends Base {
  declare members: AssociationProxy<Member>;
  declare name: string;

  static {
    this.hasMany("members");
  }
}
registerConstant("MemberType", MemberType);
