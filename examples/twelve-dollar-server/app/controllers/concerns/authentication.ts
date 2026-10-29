import { Concern, extend } from "@blazetrails/activesupport";

type Concern = {
  included(base: null, block: (this: never) => void): void;
  classMethods(block: (mod: Record<string, unknown>) => void): void;
};
import type { ActionController } from "@blazetrails/actionpack";
import { Trails } from "@blazetrails/trailties";
import { JWT } from "../../../lib/jwt.ts";
import { Current } from "../../models/current.ts";

interface Host extends ActionController.API {
  renderError(message: string, status: string): Promise<void>;
  decodeToken(token: string): Record<string, unknown> | null;
  isValidPayload(payload: Record<string, unknown>): boolean;
}

export const Authentication: {
  BEARER_PREFIX: string;
  POSITIVE_INTEGER: RegExp;
  requireAuthentication(this: Host): Promise<void>;
  decodeToken(token: string): Record<string, unknown> | null;
  isValidPayload(payload: Record<string, unknown>): boolean;
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

    Current.user_id = Number(payload.sub);
    Current.username = payload.username as string;
  },

  decodeToken(token: string): Record<string, unknown> | null {
    try {
      return JWT.decode(token, Trails.configuration!.x.jwtSecret, true, { algorithm: "HS256" })[0];
    } catch (e) {
      if (e instanceof JWT.DecodeError) return null;
      throw e;
    }
  },

  isValidPayload(payload: Record<string, unknown>): boolean {
    return (
      typeof payload.sub === "string" &&
      Authentication.POSITIVE_INTEGER.test(payload.sub) &&
      typeof payload.username === "string"
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
