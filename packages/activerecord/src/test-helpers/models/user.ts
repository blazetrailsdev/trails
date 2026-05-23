// vendor/rails/activerecord/test/models/user.rb
import { Base } from "../../base.js";
import { hasSecurePassword } from "../../secure-password.js";
import { hasSecureToken } from "../../secure-token.js";
import { Notification } from "./notification.js";

export class User extends Base {
  static {
    this.hasAndBelongsToMany("jobsPool", {
      className: "Job",
      joinTable: "jobs_pool",
    });

    this.hasOne("room");
    this.hasOne("ownedRoom", { className: "Room", foreignKey: "owner_id" });
    this.hasOne("familyTree", {
      scope: (q: any) => q.where({ token: null }),
      foreignKey: "member_id",
    });
    this.hasOne("family", { through: "familyTree" });
    this.hasMany("familyMembers", { through: "family", source: "members" });

    this.hasOne("letRoom", { className: "Room", foreignKey: "landlord_id", dependent: "destroy" });
    this.hasOne("rentedRoom", { className: "Room", foreignKey: "tenant_id", dependent: "destroy" });
  }
}

hasSecurePassword(User, { validations: false });
hasSecurePassword(User, "recoveryPassword", { validations: false });
hasSecureToken(User);
hasSecureToken(User, "authToken", { length: 36 });

export class UserWithNotification extends User {
  static {
    this.afterCreate(async function () {
      await (Notification as any).create({ message: "A new user has been created." });
    });
  }
}

export class NestedUser extends Base {
  static {
    this.tableName = "users";
  }
}

export class NestedNestedUser extends Base {
  static {
    this.hasMany("nestedUsers");
  }
}
