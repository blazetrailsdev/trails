import { ActionCable } from "@blazetrails/actioncable";
import { Session } from "../../models/session.ts";

export class Connection extends ActionCable.Connection.Base {
  declare currentUser: unknown;

  static {
    this.identifiedBy("currentUser");
  }

  async connect(): Promise<void> {
    if (!(await this.setCurrentUser())) this.rejectUnauthorizedConnection();
  }

  protected async setCurrentUser(): Promise<unknown> {
    const session = await Session.findBy({ id: this.cookies.signed.get("session_id") });
    if (session) return (this.currentUser = await session.user);
  }
}
