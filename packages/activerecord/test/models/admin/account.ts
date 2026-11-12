import { DescendantsTracker } from "@blazetrails/activesupport";
import { Admin } from "../admin.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";
import type { AssociationProxy } from "../../../lib/associations/collection-proxy.js";
import type { AdminUser } from "./user.js";

export class AdminAccount extends Base {
  static {
    constSet(Admin, "Account", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  declare users: AssociationProxy<AdminUser>;

  static {
    this.hasMany("users");
  }
}
