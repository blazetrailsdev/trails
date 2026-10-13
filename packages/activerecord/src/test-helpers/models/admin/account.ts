import { Admin } from "../admin.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import type { AdminUser } from "./user.js";
import { registerModel } from "../../../associations.js";

export class AdminAccount extends Base {
  static {
    registerModel(rbModConstSet(Admin, "Account", this));
  }
  declare users: AssociationProxy<AdminUser>;

  static {
    this.hasMany("users");
  }
}
