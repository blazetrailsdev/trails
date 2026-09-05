import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Family } from "./family.js";
import type { FamilyTree } from "./family-tree.js";
import type { Job } from "./job.js";
import type { Room } from "./room.js";
import { Base } from "../../base.js";
import { hasSecurePassword } from "../../secure-password.js";
import { Notification } from "./notification.js";

export class User extends Base {
  declare jobsPool: AssociationProxy<Job>;
  declare room: Room | null;
  declare ownedRoom: Room | null;
  declare familyTree: FamilyTree | null;
  declare family: Family | null;
  declare familyMembers: AssociationProxy<User>;
  declare letRoom: Room | null;
  declare rentedRoom: Room | null;
  declare loadHasOne: ((name: "room") => Promise<Room | null>) &
    ((name: "ownedRoom") => Promise<Room | null>) &
    ((name: "familyTree") => Promise<FamilyTree | null>) &
    ((name: "family") => Promise<Family | null>) &
    ((name: "letRoom") => Promise<Room | null>) &
    ((name: "rentedRoom") => Promise<Room | null>);
  declare auth_token: string;
  declare created_at: (RubyTime | Temporal.PlainDateTime) | null;
  declare password: string | null;
  declare password_digest: string;
  declare recovery_password: string | null;
  declare recovery_password_digest: string;
  declare token: string;
  declare updated_at: (RubyTime | Temporal.PlainDateTime) | null;

  static {
    this.hasAndBelongsToMany("jobsPool", {
      className: "Job",
      joinTable: "jobs_pool",
    });

    this.hasOne("room");
    this.hasOne("ownedRoom", { className: "Room", foreignKey: "owner_id" });
    this.hasOne("familyTree", (q: any) => q.where({ token: null }), { foreignKey: "member_id" });
    this.hasOne("family", { through: "familyTree" });
    this.hasMany("familyMembers", { through: "family", source: "members" });

    this.hasOne("letRoom", { className: "Room", foreignKey: "landlord_id", dependent: "destroy" });
    this.hasOne("rentedRoom", { className: "Room", foreignKey: "tenant_id", dependent: "destroy" });
  }
}

hasSecurePassword.call(User, "password", { validations: false });
hasSecurePassword.call(User, "recovery_password", { validations: false });
User.hasSecureToken();
User.hasSecureToken("auth_token", { length: 36 });

export class UserWithNotification extends User {
  declare loadHasOne: ((name: "room") => Promise<Room | null>) &
    ((name: "ownedRoom") => Promise<Room | null>) &
    ((name: "familyTree") => Promise<FamilyTree | null>) &
    ((name: "family") => Promise<Family | null>) &
    ((name: "letRoom") => Promise<Room | null>) &
    ((name: "rentedRoom") => Promise<Room | null>);

  static {
    this.afterCreate(async function () {
      await Notification.create({ message: "A new user has been created." });
    });
  }
}

export class NestedUser extends Base {
  static {
    this.tableName = "users";
  }
}

export class NestedNestedUser extends Base {
  declare nestedUsers: AssociationProxy<NestedUser>;

  static {
    this.hasMany("nestedUsers");
  }
}
