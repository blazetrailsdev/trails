import { hours, type TimeWithZone } from "@blazetrails/activesupport";
import { ApplicationRecord } from "./application-record.ts";
import type { User } from "./user.ts";

export class Session extends ApplicationRecord {
  static ACTIVITY_REFRESH_RATE = hours(1);

  declare token: string;
  declare last_active_at: TimeWithZone;
  declare user: Promise<User>;

  static {
    this.hasSecureToken();

    this.belongsTo("user");

    this.beforeCreate(function (this: Session) {
      this.last_active_at ??= new Date();
    });
  }

  static async startBang(
    this: typeof Session,
    { userAgent, ipAddress }: { userAgent: string | null; ipAddress: string | null },
  ): Promise<Session> {
    return await this.createBang({ user_agent: userAgent, ip_address: ipAddress });
  }

  async resume({
    userAgent,
    ipAddress,
  }: {
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<void> {
    if (this.last_active_at.isBefore(Session.ACTIVITY_REFRESH_RATE.ago())) {
      await this.updateBang({
        user_agent: userAgent,
        ip_address: ipAddress,
        last_active_at: new Date(),
      });
    }
  }
}
