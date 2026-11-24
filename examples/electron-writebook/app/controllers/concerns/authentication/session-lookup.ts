import type { ActionController } from "@blazetrails/actionpack";
import { Session } from "../../../models/session.ts";

export const SessionLookup = {
  async findSessionByCookie(this: ActionController.Base): Promise<Session | null> {
    const token = this.cookies().signed.get("session_token") as string | null | undefined;
    if (token) {
      return await Session.findBy({ token });
    }
    return null;
  },
};
