import type { Relation } from "../../relation.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Club } from "./club.js";
import type { Member } from "./member.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";
import { registerSubclass } from "../../inheritance.js";

export class Membership extends Base {
  declare isMembership: () => boolean;
  declare membershipBang: () => Promise<true | undefined>;
  declare static membership: () => Relation<Membership>;
  declare static notMembership: () => Relation<Membership>;
  declare isCurrentMembership: () => boolean;
  declare currentMembershipBang: () => Promise<true | undefined>;
  declare static currentMembership: () => Relation<Membership>;
  declare static notCurrentMembership: () => Relation<Membership>;
  declare isSuperMembership: () => boolean;
  declare superMembershipBang: () => Promise<true | undefined>;
  declare static superMembership: () => Relation<Membership>;
  declare static notSuperMembership: () => Relation<Membership>;
  declare isSelectedMembership: () => boolean;
  declare selectedMembershipBang: () => Promise<true | undefined>;
  declare static selectedMembership: () => Relation<Membership>;
  declare static notSelectedMembership: () => Relation<Membership>;
  declare isTenantMembership: () => boolean;
  declare tenantMembershipBang: () => Promise<true | undefined>;
  declare static tenantMembership: () => Relation<Membership>;
  declare static notTenantMembership: () => Relation<Membership>;
  declare member: Member | null;
  declare club: Club | null;
  declare loadBelongsTo: ((name: "member") => Promise<Member | null>) &
    ((name: "club") => Promise<Club | null>);
  declare club_id: number;
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare favorite: boolean | null;
  declare joined_on: RubyTime | Temporal.PlainDateTime;
  declare member_id: number;
  declare "type":
    | "Membership"
    | "CurrentMembership"
    | "SuperMembership"
    | "SelectedMembership"
    | "TenantMembership"
    | null;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.enum("type", [
      "Membership",
      "CurrentMembership",
      "SuperMembership",
      "SelectedMembership",
      "TenantMembership",
    ]);
    this.inheritanceColumn = "type";
    this.belongsTo("member");
    this.belongsTo("club");
  }
}

export class CurrentMembership extends Membership {
  declare member: Member | null;
  declare club: Club | null;
  declare loadBelongsTo: ((name: "member") => Promise<Member | null>) &
    ((name: "club") => Promise<Club | null>);

  static {
    registerModel(CurrentMembership);
    registerSubclass(CurrentMembership);
    this.belongsTo("member");
    this.belongsTo("club", { inverseOf: "membership" });
  }
}

export class SuperMembership extends Membership {
  declare member: Member | null;
  declare club: Club | null;
  declare loadBelongsTo: ((name: "member") => Promise<Member | null>) &
    ((name: "club") => Promise<Club | null>);

  static {
    registerModel(SuperMembership);
    registerSubclass(SuperMembership);
    this.belongsTo("member", (q: any) => q.order("members.id DESC"));
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
  declare member: Member | null;
  declare club: Club | null;
  declare loadBelongsTo: ((name: "member") => Promise<Member | null>) &
    ((name: "club") => Promise<Club | null>);

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
