import { Concern, extend } from "@blazetrails/activesupport";

type Concern = {
  included(base: null, block: (this: never) => void): void;
  classMethods(block: (mod: Record<string, unknown>) => void): void;
};
import type { ActionController } from "@blazetrails/actionpack";
import { toI } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { JWT } from "../../../lib/jwt.ts";
import { Current } from "../../models/current.ts";

interface Host extends ActionController.API {
  renderError(message: string | null, status: string): Promise<void>;
  decodeToken(token: string): unknown;
  isValidPayload(payload: unknown): payload is { sub: string; username: string };
}

export const Authentication: {
  BEARER_PREFIX: string;
  POSITIVE_INTEGER: RegExp;
  requireAuthentication(this: Host): Promise<void>;
  decodeToken(token: string): unknown;
  isValidPayload(payload: unknown): payload is { sub: string; username: string };
} = {
  BEARER_PREFIX: "Bearer ",
  POSITIVE_INTEGER: /^[1-9]\d*$/,

  async requireAuthentication(this: Host): Promise<void> {
    const header = this.request.authorization ?? "";
    if (!header.startsWith(Authentication.BEARER_PREFIX)) {
      return this.renderError("missing bearer token", ":unauthorized");
    }

    const payload = this.decodeToken(header.slice(Authentication.BEARER_PREFIX.length));
    if (!payload) return this.renderError("invalid or expired token", ":unauthorized");
    if (!this.isValidPayload(payload)) {
      return this.renderError("invalid token payload", ":unauthorized");
    }

    Current.userId = toI(payload.sub);
    Current.username = payload.username;
  },

  decodeToken(token: string): unknown {
    try {
      return JWT.decode(token, Trails.configuration!.x.jwtSecret, true, { algorithm: "HS256" })[0];
    } catch (e) {
      if (e instanceof JWT.DecodeError) return null;
      throw e;
    }
  },

  isValidPayload(payload: unknown): payload is { sub: string; username: string } {
    return (
      typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).sub === "string" &&
      Authentication.POSITIVE_INTEGER.test((payload as Record<string, string>).sub) &&
      typeof (payload as Record<string, unknown>).username === "string"
    );
  },
};

extend(Authentication, Concern);

(Authentication as unknown as Concern).included(null, function (this: typeof ActionController.API) {
  this.beforeAction("requireAuthentication");
});

(Authentication as unknown as Concern).classMethods((mod) => {
  mod.allowUnauthenticatedAccess = function (this: typeof ActionController.API, options = {}) {
    this.skipBeforeAction("requireAuthentication", options);
  };
});
