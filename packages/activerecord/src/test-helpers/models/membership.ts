// vendor/rails/activerecord/test/models/membership.rb
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";
import { registerSubclass } from "../../inheritance.js";

export class Membership extends Base {
  static {
    // Rails declares `enum :type` on the default STI inheritance column, so the
    // enum *backs* an integer `type` column that also drives STI dispatch.
    // trails needs STI enabled explicitly; with the enum on the same column the
    // `type_condition` serializes each subclass' sti_name (its class name) to
    // the enum integer (e.g. SelectedMembership → 3).
    this.enum("type", {
      Membership: 0,
      CurrentMembership: 1,
      SuperMembership: 2,
      SelectedMembership: 3,
      TenantMembership: 4,
    });
    this.inheritanceColumn = "type";
    this.belongsTo("member");
    this.belongsTo("club");
  }
}

export class CurrentMembership extends Membership {
  static {
    registerModel(CurrentMembership);
    registerSubclass(CurrentMembership);
    this.belongsTo("member");
    this.belongsTo("club", { inverseOf: "membership" });
  }
}

export class SuperMembership extends Membership {
  static {
    registerModel(SuperMembership);
    registerSubclass(SuperMembership);
    this.belongsTo("member", { scope: (q: any) => q.order("members.id DESC") });
    this.belongsTo("club");
  }
}

export class SelectedMembership extends Membership {
  static {
    registerModel(SelectedMembership);
    registerSubclass(SelectedMembership);
    this.defaultScope((q: any) => q.select("'1' as foo"));
  }
}

export class TenantMembership extends Membership {
  static currentMember: any = null;

  static {
    registerModel(TenantMembership);
    registerSubclass(TenantMembership);
    this.belongsTo("member");
    this.belongsTo("club");
    this.defaultScope((q: any) => {
      if (TenantMembership.currentMember) {
        return q.where({ member: TenantMembership.currentMember });
      }
      return q.all();
    });
  }
}
