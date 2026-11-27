import { Base } from "@blazetrails/actioncable/connection/base";
import { include } from "@blazetrails/ruby-compat";
import {
  SessionLookup,
  type SessionLookupHost,
} from "../../controllers/concerns/authentication/session-lookup.ts";
import type { User } from "../../models/user.ts";

export class Connection extends Base {
  declare currentUser: User | null;

  static {
    include(this, SessionLookup);
    this.identifiedBy("currentUser");
  }

  async connect(): Promise<void> {
    this.currentUser = await this.findVerifiedUser();
  }

  private async findVerifiedUser(): Promise<User> {
    // ActionCable's Connection#cookies is a reader where ActionController's is a method.
    const host: SessionLookupHost = { cookies: () => this.cookies };
    const verifiedSession = await SessionLookup.findSessionByCookie.call(host);
    if (verifiedSession != null) {
      return await verifiedSession.user;
    } else {
      return this.rejectUnauthorizedConnection();
    }
  }
}
