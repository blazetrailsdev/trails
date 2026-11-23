import { CurrentAttributes } from "@blazetrails/activesupport";
import type { Session } from "./session.ts";
import type { User } from "./user.ts";

export class Current extends CurrentAttributes {
  declare static session: Session | null | undefined;
  declare static user: User | null | undefined;

  static {
    // `session.user` is an awaited association read in trails, so the signed-in user
    // is its own attribute, set by the Authentication concern.
    this.attribute("session", "user");
  }
}
