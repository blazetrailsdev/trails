import { Session } from "../../../models/session.ts";

export interface SessionLookupHost {
  cookies(): { signed: { get(name: string): unknown } };
}

export const SessionLookup = {
  async findSessionByCookie(this: SessionLookupHost): Promise<Session | null> {
    const token = this.cookies().signed.get("session_token") as string | null | undefined;
    if (token) {
      return await Session.findBy({ token });
    }
    return null;
  },
};
