import bcrypt from "bcryptjs";
import { camelize, include, isBlank, Module } from "@blazetrails/activesupport";
import { Model } from "./model.js";

const MAX_PASSWORD_LENGTH_ALLOWED = 72;
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

/**
 * Mirrors: ActiveModel::SecurePassword::ClassMethods#has_secure_password
 * (secure_password.rb:117-180): includes a freshly built
 * {@link InstanceMethodsOnActivation}, registers the three `validate` blocks
 * and `validates_confirmation_of` (:131-159), and — only for a model capable
 * of it (`respond_to?(:generates_token_for)`, so an Active Record rather than a
 * vanilla Active Model) — the reset-token purpose and its
 * `find_by_#{attribute}_reset_token` finders (:161-178).
 *
 * The first `validate` keys its error to the password attribute rather than to
 * the digest it checks, so the message makes sense to the end user
 * (:133-138); the third bounds the password at BCrypt's 72-byte maximum
 * (:151-156).
 */
export function hasSecurePassword(
  modelClass: typeof Model,
  attribute: string = "password",
  options: { validations?: boolean; resetToken?: boolean } = {},
) {
  const validations = options.validations !== false;
  const resetToken = options.resetToken !== false;
  const digestAttr = `${attribute}_digest`;
  const challengeAttr = `${attribute}Challenge`;

  include(
    modelClass as unknown as new (...args: unknown[]) => unknown,
    new InstanceMethodsOnActivation(attribute, { resetToken }),
  );

  if (validations) {
    modelClass.validate((record: Model) => {
      if (isBlank(publicSend(record, digestAttr))) record.errors.add(attribute, ":blank");
    });

    modelClass.validate((record: Model) => {
      const challenge = publicSend(record, challengeAttr) as string | null;
      if (challenge != null) {
        const digestWas = record.attributeWas(digestAttr) as string | null | undefined;
        if (isBlank(digestWas) || !bcrypt.compareSync(challenge, digestWas as string)) {
          record.errors.add(challengeAttr);
        }
      }
    });

    modelClass.validate((record: Model) => {
      const passwordValue = publicSend(record, attribute) as string | null;
      if (
        !isBlank(passwordValue) &&
        textEncoder.encode(passwordValue as string).length > MAX_PASSWORD_LENGTH_ALLOWED
      ) {
        record.errors.add(attribute, ":password_too_long");
      }
    });

    modelClass.validatesConfirmationOf(attribute, { allowBlank: true });
  }

  const tokenHost = modelClass as unknown as TokenHost;
  if (resetToken && typeof tokenHost.generatesTokenFor === "function") {
    tokenHost.generatesTokenFor(`${attribute}_reset`, {
      expiresIn: 15 * 60,
      block: (record: Model) => {
        const salt = publicSend(record, `${attribute}Salt`) as string | null;
        return salt?.slice(-10) ?? null;
      },
    });

    const findByMethod = `findBy${camelize(attribute)}ResetToken`;
    Object.defineProperty(modelClass, findByMethod, {
      value: function (this: TokenHost, token: string) {
        return this.findByTokenFor!(`${attribute}_reset`, token);
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(modelClass, `${findByMethod}Bang`, {
      value: function (this: TokenHost, token: string) {
        return this.findByTokenForBang!(`${attribute}_reset`, token);
      },
      writable: true,
      configurable: true,
    });
  }
}

interface TokenHost {
  generatesTokenFor?: (
    purpose: string,
    options: { expiresIn?: number; block?: (record: Model) => unknown },
  ) => void;
  findByTokenFor?: (purpose: string, token: string) => unknown;
  findByTokenForBang?: (purpose: string, token: string) => unknown;
}

/**
 * Ruby's `public_send(name)` over a zero-arg reader, which is a property in
 * trails (CLAUDE.md § "Generated attribute readers are properties").
 */
function publicSend(record: Model, name: string): unknown {
  return (record as unknown as Record<string, unknown>)[name];
}

/**
 * Mirrors: ActiveModel::SecurePassword::InstanceMethodsOnActivation
 * (secure_password.rb:182-227), the module `has_secure_password` includes into
 * the model — one per activated attribute. It carries the `attr_reader`
 * `attribute` and the `attr_accessor` pair `#{attribute}_confirmation` /
 * `#{attribute}_challenge` (:184,197), which are plain ivars rather than
 * attributes — they never reach the attribute set, and on an Active Record
 * must not shadow a column; `authenticate_#{attribute}`, which answers `self`
 * when the password is correct and `false` otherwise (:209-212); the
 * `#{attribute}_salt` reader (:215-218); the
 * `alias_method :authenticate, :authenticate_password` Rails installs only for
 * the default attribute (:219); and, under `reset_token`, the class-level
 * configured `#{attribute}_reset_token` (:221-225).
 */
export class InstanceMethodsOnActivation extends Module {
  constructor(attribute: string, options: { resetToken: boolean }) {
    super();
    const digestAttr = `${attribute}_digest`;
    const passwordIvar = new WeakMap<object, string | null>();
    const confirmationIvar = new WeakMap<object, unknown>();
    const challengeIvar = new WeakMap<object, unknown>();

    this.moduleEval((mod) => {
      Object.defineProperty(mod, attribute, {
        get(this: Model) {
          return passwordIvar.get(this) ?? null;
        },
        set(this: Model, unencryptedPassword: unknown) {
          if (unencryptedPassword == null) {
            passwordIvar.set(this, null);
            publicSendWriter(this, digestAttr, null);
          } else if (String(unencryptedPassword) !== "") {
            passwordIvar.set(this, String(unencryptedPassword));
            const cost = SecurePassword.minCost ? MIN_COST : DEFAULT_COST;
            publicSendWriter(this, digestAttr, bcrypt.hashSync(String(unencryptedPassword), cost));
          }
        },
        configurable: true,
      });

      Object.defineProperty(mod, `${attribute}Confirmation`, {
        get(this: Model) {
          return confirmationIvar.has(this) ? confirmationIvar.get(this) : null;
        },
        set(this: Model, value: unknown) {
          confirmationIvar.set(this, value);
        },
        configurable: true,
      });

      Object.defineProperty(mod, `${attribute}Challenge`, {
        get(this: Model) {
          return challengeIvar.get(this) ?? null;
        },
        set(this: Model, value: unknown) {
          const str = value == null ? null : String(value);
          challengeIvar.set(this, isBlank(str) ? null : str);
        },
        configurable: true,
      });
    });

    const authenticateAttribute = function (this: Model, unencryptedPassword: unknown) {
      if (typeof unencryptedPassword !== "string" || !unencryptedPassword) return false;
      const attributeDigest = publicSend(this, digestAttr) as string | null;
      return !isBlank(attributeDigest) &&
        bcrypt.compareSync(unencryptedPassword, attributeDigest as string)
        ? this
        : false;
    };
    this.defineMethod(`authenticate${camelize(attribute)}`, authenticateAttribute);

    this.moduleEval((mod) => {
      Object.defineProperty(mod, `${attribute}Salt`, {
        get(this: Model) {
          const attributeDigest = publicSend(this, digestAttr) as string | null;
          return isBlank(attributeDigest) ? null : bcrypt.getSalt(attributeDigest as string);
        },
        configurable: true,
      });
    });

    if (attribute === "password") this.defineMethod("authenticate", authenticateAttribute);

    if (options.resetToken) {
      this.moduleEval((mod) => {
        Object.defineProperty(mod, `${attribute}ResetToken`, {
          get(this: Model) {
            return (
              this as unknown as { generateTokenFor(purpose: string): string }
            ).generateTokenFor(`${attribute}_reset`);
          },
          configurable: true,
        });
      });
    }
  }
}

/** Ruby's `public_send("#{name}=", value)`, a property write in trails. */
function publicSendWriter(record: Model, name: string, value: string | null): void {
  (record as unknown as Record<string, unknown>)[name] = value;
}
