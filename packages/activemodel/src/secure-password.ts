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
  const resetToken = options.resetToken !== false;

  // Ruby's `attr_reader attribute` / `attr_accessor :"#{attribute}_confirmation",
  // :"#{attribute}_challenge"` (secure_password.rb:184,197) are plain ivars, not
  // attributes: they never reach the attribute set, and on an Active Record they
  // must not shadow a column or suppress schema reflection.
  const passwordCache = new WeakMap<object, string | null>();
  const confirmationCache = new WeakMap<object, unknown>();
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
      return confirmationCache.has(this) ? confirmationCache.get(this) : null;
    },
    set(this: Model, value: unknown) {
      confirmationCache.set(this, value);
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

  const authMethodName = `authenticate${camelize(attribute)}`;
  const authenticateAttribute = function (this: Model, unencryptedPassword: unknown) {
    if (typeof unencryptedPassword !== "string" || !unencryptedPassword) return false;
    const digest = this._readAttribute(digestAttr) as string | null;
    if (!digest) return false;
    return bcrypt.compareSync(unencryptedPassword, digest) ? this : false;
  };

  Object.defineProperty(modelClass.prototype, authMethodName, {
    value: authenticateAttribute,
    writable: true,
    configurable: true,
  });

  // `alias_method :authenticate, :authenticate_password if attribute == :password`
  // (secure_password.rb:219).
  if (attribute === "password") {
    Object.defineProperty(modelClass.prototype, "authenticate", {
      value: authenticateAttribute,
      writable: true,
      configurable: true,
    });
  }

  if (validations) {
    modelClass.validate((record: Model) => {
      const pwd = passwordCache.get(record);
      const digest = record._readAttribute(digestAttr);

      if (isBlank(digest)) {
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
        // `validates_confirmation_of attribute, allow_blank: true`
        // (secure_password.rb:159) — ConfirmationValidator keys the error to
        // `#{attribute}_confirmation` and interpolates the human name of the
        // attribute itself.
        const confirmation = confirmationCache.get(record);
        if (confirmation !== undefined && confirmation !== null && pwd !== confirmation) {
          record.errors.add(confirmationAttr, ":confirmation", { attribute: humanAttr });
        }
      }
    });
  }

  // "Only generate tokens for records that are capable of doing so (Active
  // Records, not vanilla Active Models)" — `if reset_token &&
  // respond_to?(:generates_token_for)` (secure_password.rb:161-178).
  const tokenHost = modelClass as unknown as {
    generatesTokenFor?: (
      purpose: string,
      options: { expiresIn?: number; block?: (record: Model) => unknown },
    ) => void;
    findByTokenFor?: (purpose: string, token: string) => unknown;
    findByTokenForBang?: (purpose: string, token: string) => unknown;
  };
  if (resetToken && typeof tokenHost.generatesTokenFor === "function") {
    const purpose = `${attribute}_reset`;
    tokenHost.generatesTokenFor(purpose, {
      expiresIn: 15 * 60,
      block: (record: Model) => {
        const salt = (record as unknown as Record<string, string | null>)[saltMethodName];
        return salt == null ? null : salt.slice(-10);
      },
    });

    const resetTokenMethod = `${attribute}ResetToken`;
    Object.defineProperty(modelClass.prototype, resetTokenMethod, {
      get(this: Model) {
        return (this as unknown as { generateTokenFor(purpose: string): string }).generateTokenFor(
          purpose,
        );
      },
      configurable: true,
    });

    const findByMethod = `findBy${camelize(attribute)}ResetToken`;
    Object.defineProperty(modelClass, findByMethod, {
      value: function (this: typeof Model, token: string) {
        return (this as unknown as typeof tokenHost).findByTokenFor!(purpose, token);
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(modelClass, `${findByMethod}Bang`, {
      value: function (this: typeof Model, token: string) {
        return (this as unknown as typeof tokenHost).findByTokenForBang!(purpose, token);
      },
      writable: true,
      configurable: true,
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
