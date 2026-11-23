import { defineModule, extend, included } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { Current } from "../../models/current.ts";
import { Session } from "../../models/session.ts";
import type { User } from "../../models/user.ts";

interface Host extends ActionController.Base {
  resumeSession(): Promise<Session | null | undefined>;
  findSessionByCookie(): Promise<Session | null>;
  requestAuthentication(): Promise<void>;
}

interface HostClass {
  skipBeforeAction(name: string, options: Record<string, unknown>): void;
  beforeAction(name: string): void;
  helperMethod(name: string): void;
}

/** Rails' `class_methods do ... end` block. */
export const ClassMethods = {
  allowUnauthenticatedAccess(this: HostClass, options: Record<string, unknown> = {}): void {
    this.skipBeforeAction(":requireAuthentication", options);
  },
};

export const Authentication = defineModule(
  {
    [included](base: HostClass): void {
      extend(base, ClassMethods);
      base.beforeAction(":requireAuthentication");
      base.helperMethod("authenticated");
    },
  },
  undefined,
  {
    async authenticated(this: Host): Promise<unknown> {
      return await this.resumeSession();
    },

    async requireAuthentication(this: Host): Promise<unknown> {
      return (await this.resumeSession()) || this.requestAuthentication();
    },

    // `session.user` is an awaited association read in trails, so the signed-in
    // user is seated on Current beside the session.
    async resumeSession(this: Host): Promise<Session | null | undefined> {
      Current.session ??= await this.findSessionByCookie();
      if (Current.session) Current.user ??= await Current.session.user;
      return Current.session;
    },

    async findSessionByCookie(this: Host): Promise<Session | null> {
      const sessionId = this.cookies().signed.get("session_id");
      return sessionId ? await Session.findBy({ id: sessionId }) : null;
    },

    async requestAuthentication(this: Host): Promise<void> {
      this.session["return_to_after_authenticating"] = this.request.url;
      await this.redirectTo(this.newSessionPath());
    },

    afterAuthenticationUrl(this: Host): string {
      const url = this.session["return_to_after_authenticating"];
      delete this.session["return_to_after_authenticating"];
      return url || "/";
    },

    async startNewSessionFor(this: Host, user: User): Promise<Session> {
      const session = await user.sessions.createBang({
        user_agent: this.request.getHeader("HTTP_USER_AGENT"),
        ip_address: this.request.remoteIp,
      });
      Current.session = session;
      Current.user = user;
      this.cookies().signed.permanent.set("session_id", {
        value: session.id,
        httpOnly: true,
        sameSite: ":lax",
      });
      return session;
    },

    async terminateSession(this: Host): Promise<void> {
      await Current.session!.destroy();
      this.cookies().delete("session_id");
    },
  },
);
