import bcrypt from "bcryptjs";
import { humanize, camelize, isBlank } from "@blazetrails/activesupport";
import { Model } from "./model.js";

const MIN_COST = 4;
const DEFAULT_COST = 12;
const textEncoder = new TextEncoder();

export class SecurePassword {
  static minCost: boolean = false;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SecurePassword {
  export interface ClassMethods {
    hasSecurePassword(
      attribute?: string,
      options?: { validations?: boolean; resetToken?: boolean },
    ): void;
  }
}

export function hasSecurePassword(
  modelClass: typeof Model,
  attribute: string = "password",
  options: {
    validations?: boolean;
    /**
     * When true (default), wire up a password-reset token via
     * `generates_token_for` (ActiveRecord only — no-op in plain
     * ActiveModel).
     *
     * Mirrors: ActiveModel::SecurePassword has_secure_password :reset_token
     */
    resetToken?: boolean;
  } = {},
) {
  const digestAttr = `${attribute}_digest`;
  const confirmationAttr = `${attribute}Confirmation`;
  const challengeAttr = `${attribute}Challenge`;
  const validations = options.validations !== false;

  if (!modelClass._defaultAttributes().isKey(digestAttr)) {
    modelClass.attribute(digestAttr, "string");
  }

  if (!modelClass._defaultAttributes().isKey(confirmationAttr)) {
    modelClass.attribute(confirmationAttr, "string");
  }

  const passwordCache = new WeakMap<object, string | null>();
  const challengeCache = new WeakMap<object, string | null>();

  Object.defineProperty(modelClass.prototype, attribute, {
    get(this: Model) {
      return passwordCache.get(this) ?? null;
    },
    set(this: Model, unencryptedPassword: unknown) {
      if (unencryptedPassword === null || unencryptedPassword === undefined) {
        passwordCache.set(this, null);
        this._writeAttribute(digestAttr, null);
      } else if (String(unencryptedPassword) !== "") {
        passwordCache.set(this, String(unencryptedPassword));
        const cost = SecurePassword.minCost ? MIN_COST : DEFAULT_COST;
        this._writeAttribute(digestAttr, bcrypt.hashSync(String(unencryptedPassword), cost));
      }
    },
    configurable: true,
  });

  Object.defineProperty(modelClass.prototype, confirmationAttr, {
    get(this: Model) {
      return this._readAttribute(confirmationAttr);
    },
    set(this: Model, value: unknown) {
      this._writeAttribute(confirmationAttr, value);
    },
    configurable: true,
  });

  Object.defineProperty(modelClass.prototype, challengeAttr, {
    get(this: Model) {
      return challengeCache.get(this) ?? null;
    },
    set(this: Model, value: unknown) {
      const str = value === null || value === undefined ? null : String(value);
      challengeCache.set(this, str && str.trim() !== "" ? str : null);
    },
    configurable: true,
  });

  const saltMethodName = `${attribute}Salt`;
  Object.defineProperty(modelClass.prototype, saltMethodName, {
    get(this: Model) {
      const digest = this._readAttribute(digestAttr) as string | null;
      if (!digest) return null;
      return bcrypt.getSalt(digest);
    },
    configurable: true,
  });

  const authMethodName =
    attribute === "password" ? "authenticate" : `authenticate${camelize(attribute)}`;

  Object.defineProperty(modelClass.prototype, authMethodName, {
    value: function (this: Model, unencryptedPassword: unknown) {
      if (typeof unencryptedPassword !== "string" || !unencryptedPassword) return false;
      const digest = this._readAttribute(digestAttr) as string | null;
      if (!digest) return false;
      return bcrypt.compareSync(unencryptedPassword, digest) ? this : false;
    },
    writable: true,
    configurable: true,
  });

  if (validations) {
    modelClass.validate((record: Model) => {
      const pwd = passwordCache.get(record);
      const digest = record._readAttribute(digestAttr);

      if (isBlank(digest) && (pwd === undefined || pwd === null)) {
        record.errors.add(attribute, ":blank");
      }

      const challenge = challengeCache.get(record) ?? null;
      if (challenge !== null) {
        // Rails secure_password.rb:141-147: read digest_was from dirty tracking
        // so DB-loaded records (no setter call) work correctly.
        // Error fires when digestWas is blank OR doesn't match challenge.
        const digestWas = record.attributeWas(digestAttr) as string | null | undefined;
        if (!digestWas || !bcrypt.compareSync(challenge, digestWas)) {
          record.errors.add(challengeAttr);
        }
      }

      if (pwd !== null && pwd !== undefined) {
        if (textEncoder.encode(pwd).length > 72) {
          record.errors.add(attribute, ":password_too_long");
        }

        const humanAttr = modelClass.humanAttributeName
          ? modelClass.humanAttributeName(attribute)
          : humanize(attribute);
        const confirmation = record._readAttribute(confirmationAttr);
        if (confirmation !== undefined && confirmation !== null && pwd !== confirmation) {
          record.errors.add(attribute, ":confirmation", { attribute: humanAttr });
        }
      }
    });
  }
}

/**
 * Module mixed into the model instance when hasSecurePassword is called.
 *
 * Mirrors: ActiveModel::SecurePassword::InstanceMethodsOnActivation
 */
export class InstanceMethodsOnActivation {
  readonly attribute: string;
  constructor(attribute: string) {
    this.attribute = attribute;
  }
}
