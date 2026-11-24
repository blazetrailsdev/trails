import { defineModule, extend, included, inquiry, isPresent } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { Current } from "../../models/current.ts";
import type { Session } from "../../models/session.ts";
import type { User } from "../../models/user.ts";
import { SessionLookup } from "./authentication/session-lookup.ts";

type Options = Record<string, unknown>;

interface HostClass {
  skipBeforeAction(name: string, options?: Options): void;
  beforeAction(name: string | (() => unknown), options?: Options): void;
  helperMethod(name: string): void;
  protectFromForgery(options: Options): void;
  allowUnauthenticatedAccess(options?: Options): void;
}

export interface Host extends ActionController.Base {
  findSessionByCookie(): Promise<Session | null>;
  isSignedIn(): boolean;
  requireAuthentication(): Promise<unknown>;
  restoreAuthentication(): Promise<unknown>;
  requestAuthentication(): Promise<void>;
  startNewSessionFor(user: User): Promise<Session>;
  resumeSession(session: Session): Promise<void>;
  terminateCurrentSession(): Promise<void>;
  authenticatedAs(session: Session): Promise<void>;
  postAuthenticatingUrl(): string;
  setAuthenticationCookie(session: Session): void;
  removeAuthenticationCookie(): void;
  setAuthenticatedBy(method: string): void;
  authenticatedBy(): ReturnType<typeof inquiry>;
  _authenticatedBy?: ReturnType<typeof inquiry>;
}

export const ClassMethods = {
  requireUnauthenticatedAccess(this: HostClass, options: Options = {}): void {
    this.allowUnauthenticatedAccess(options);
    this.beforeAction(":redirectSignedInUserToRoot", options);
  },

  allowUnauthenticatedAccess(this: HostClass, options: Options = {}): void {
    this.skipBeforeAction(":requireAuthentication", options);
    this.beforeAction(":restoreAuthentication", options);
  },
};

export const Authentication = defineModule(
  {
    [included](base: HostClass): void {
      extend(base, ClassMethods);

      base.beforeAction(":requireAuthentication");
      base.helperMethod("isSignedIn");

      base.protectFromForgery({
        with: "exception",
        unless: function (this: Host) {
          return this.authenticatedBy().isBotKey();
        },
      });
    },
  },
  undefined,
  {
    ...SessionLookup,

    isSignedIn(this: Host): boolean {
      return isPresent(Current.user);
    },

    async requireAuthentication(this: Host): Promise<unknown> {
      return (await this.restoreAuthentication()) || (await this.requestAuthentication());
    },

    async restoreAuthentication(this: Host): Promise<unknown> {
      const session = await this.findSessionByCookie();
      if (session) {
        await this.resumeSession(session);
        return session;
      }
    },

    async requestAuthentication(this: Host): Promise<void> {
      this.session["return_to_after_authenticating"] = this.request.url;
      await this.redirectTo(this.newSessionUrl());
    },

    async redirectSignedInUserToRoot(this: Host): Promise<void> {
      if (this.isSignedIn()) await this.redirectTo(this.rootUrl());
    },

    async startNewSessionFor(this: Host, user: User): Promise<Session> {
      const session = await user.sessions.startBang({
        userAgent: this.request.userAgent,
        ipAddress: this.request.remoteIp,
      });
      await this.authenticatedAs(session);
      return session;
    },

    async resumeSession(this: Host, session: Session): Promise<void> {
      await session.resume({ userAgent: this.request.userAgent, ipAddress: this.request.remoteIp });
      await this.authenticatedAs(session);
    },

    async terminateCurrentSession(this: Host): Promise<void> {
      await Current.session?.destroyBang();
      await this.resetSession();
      this.removeAuthenticationCookie();
    },

    async authenticatedAs(this: Host, session: Session): Promise<void> {
      await Current.setSession(session);
      this.setAuthenticatedBy("session");
      this.setAuthenticationCookie(session);
    },

    postAuthenticatingUrl(this: Host): string {
      const url = this.session["return_to_after_authenticating"] as string | undefined;
      delete this.session["return_to_after_authenticating"];
      return url ?? this.rootUrl();
    },

    setAuthenticationCookie(this: Host, session: Session): void {
      this.cookies().signed.permanent.set("session_token", {
        value: session.token,
        httponly: true,
        sameSite: ":lax",
      });
    },

    removeAuthenticationCookie(this: Host): void {
      this.cookies().delete("session_token");
    },

    setAuthenticatedBy(this: Host, method: string): void {
      this._authenticatedBy = inquiry(String(method));
    },

    authenticatedBy(this: Host): ReturnType<typeof inquiry> {
      return (this._authenticatedBy ??= inquiry(""));
    },
  },
);
