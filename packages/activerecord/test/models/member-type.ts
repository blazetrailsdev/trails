import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Member } from "./member.js";
import { Base } from "../../lib/base.js";

export class MemberType extends Base {
  declare members: AssociationProxy<Member>;
  declare name: string;

  static {
    this.hasMany("members");
  }
}
constSet(TopLevel, "MemberType", MemberType);
DescendantsTracker.registerSubclass(Base, MemberType);
