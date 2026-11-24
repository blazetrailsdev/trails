import { CurrentAttributes } from "@blazetrails/activesupport";
import { Account } from "./account.ts";
import type { Session } from "./session.ts";
import type { User } from "./user.ts";

export class Current extends CurrentAttributes {
  declare static session: Session | null | undefined;
  declare static user: User | null | undefined;

  static {
    this.attribute("session", "user");
  }

  static async setSession(value: Session | null | undefined): Promise<void> {
    this.session = value;

    if (value != null) {
      this.user = await value.user;
    }
  }

  static async account(): Promise<Account | null> {
    return await Account.first();
  }
}
