// vendor/rails/activerecord/test/models/membership.rb
import { Base } from "../../base.js";

export class Membership extends Base {
  static {
    this.enum("type", {
      Membership: 0,
      CurrentMembership: 1,
      SuperMembership: 2,
      SelectedMembership: 3,
      TenantMembership: 4,
    });
    this.belongsTo("member");
    this.belongsTo("club");
  }
}

export class CurrentMembership extends Membership {
  static {
    this.belongsTo("member");
    this.belongsTo("club", { inverseOf: "membership" });
  }
}

export class SuperMembership extends Membership {
  static {
    this.belongsTo("member", { scope: (q: any) => q.order("members.id DESC") });
    this.belongsTo("club");
  }
}

export class SelectedMembership extends Membership {
  static {
    this.defaultScope((q: any) => q.select("'1' as foo"));
  }
}

export class TenantMembership extends Membership {
  static currentMember: any = null;

  static {
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
