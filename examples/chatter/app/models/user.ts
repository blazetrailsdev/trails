import { minutes } from "@blazetrails/activesupport";
import { ApplicationRecord } from "./application-record.ts";

export class User extends ApplicationRecord {
  static {
    this.hasMany("sessions", { dependent: "destroy" });
    this.hasMany("memberships", { dependent: "destroy" });
    this.hasMany("rooms", { through: "memberships" });
    this.hasMany("messages", { dependent: "destroy" });
    this.hasOneAttached("avatar");

    this.normalizes("email_address", { with: (e: string) => e.trim().toLowerCase() });
    this.validates("email_address", {
      presence: true,
      uniqueness: true,
      format: { with: /^[^@\s]+@[^@\s]+$/ },
    });

    // A magic link is good for 15 minutes and only until the user next signs in:
    // starting a session touches `updated_at`, which changes the token's embedded value.
    this.generatesTokenFor("magic_link", { expiresIn: minutes(15) }, function (this: User) {
      return this.updated_at?.toString();
    });
  }

  displayName(): string {
    return this.name || this.email_address.split("@")[0];
  }

  initials(): string {
    return this.displayName().slice(0, 2).toUpperCase();
  }
}
