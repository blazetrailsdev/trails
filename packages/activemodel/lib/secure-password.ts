import { camelize, include, isPresent, Module, TopLevel } from "@blazetrails/activesupport";
import { LoadError, rbObjRespondTo, warn } from "@blazetrails/ruby-compat";
import { Validations } from "./validations.js";
import { Model } from "./model.js";

const MAX_PASSWORD_LENGTH_ALLOWED = 72;
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
 * @inventedArm if — PERMANENT
 * @inventedArm throw — PERMANENT
 */
export function hasSecurePassword(
  this: object,
  attribute: string = "password",
  options: { validations?: boolean; resetToken?: boolean } = {},
) {
  try {
    if (TopLevel.BCrypt === undefined) throw new LoadError("cannot load such file -- bcrypt");
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    warn(
      "You don't have bcrypt installed in your application. Please add it to your Gemfile and run bundle install.",
    );
    throw error;
  }

  const validations = options.validations !== false;
  const resetToken = options.resetToken !== false;
  const digestAttr = `${attribute}_digest`;
  const challengeAttr = `${attribute}Challenge`;

  include(this, new InstanceMethodsOnActivation(attribute, { resetToken }));

  if (validations) {
    include(this, Validations);
    const klass = this as unknown as typeof Model;

    klass.validate((record: Model) => {
      if (!isPresent(publicSend(record, digestAttr))) record.errors.add(attribute, ":blank");
    });

    klass.validate((record: Model) => {
      const challenge = publicSend(record, challengeAttr);
      if (challenge != null && challenge !== false) {
        const digestWas = rbObjRespondTo(record, `${digestAttr}Was`)
          ? (publicSend(record, `${digestAttr}Was`) as string | null | undefined)
          : undefined;
        if (
          !(
            isPresent(digestWas) &&
            new TopLevel.BCrypt!.Password(digestWas as string).isPassword(challenge)
          )
        ) {
          record.errors.add(challengeAttr);
        }
      }
    });

    klass.validate((record: Model) => {
      const passwordValue = publicSend(record, attribute) as string | null;
      if (
        isPresent(passwordValue) &&
        textEncoder.encode(passwordValue as string).length > MAX_PASSWORD_LENGTH_ALLOWED
      ) {
        record.errors.add(attribute, ":password_too_long");
      }
    });

    klass.validatesConfirmationOf(attribute, { allowBlank: true });
  }

  const tokenHost = this as TokenHost;
  if (resetToken && typeof tokenHost.generatesTokenFor === "function") {
    tokenHost.generatesTokenFor(`${attribute}_reset`, { expiresIn: 15 * 60 }, (record: Model) => {
      const salt = publicSend(record, `${attribute}Salt`) as string | null;
      return salt?.slice(-10) ?? null;
    });

    const findByMethod = `findBy${camelize(attribute)}ResetToken`;
    Object.defineProperty(this, findByMethod, {
      value: function (this: TokenHost, token: string) {
        return this.findByTokenFor!(`${attribute}_reset`, token);
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(this, `${findByMethod}Bang`, {
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
    options: { expiresIn?: number },
    block: (record: Model) => unknown,
  ) => void;
  findByTokenFor?: (purpose: string, token: string) => unknown;
  findByTokenForBang?: (purpose: string, token: string) => unknown;
}

function publicSend(record: object, name: string): unknown {
  return Reflect.get(record, name);
}

export class InstanceMethodsOnActivation extends Module {
  constructor(attribute: string, options: { resetToken: boolean }) {
    super();
    const digestAttr = `${attribute}_digest`;
    const passwordIvar = `_${attribute}`;
    const confirmationIvar = `_${attribute}Confirmation`;
    const challengeIvar = `_${attribute}Challenge`;

    this.moduleEval((mod) => {
      Object.defineProperty(mod, attribute, {
        get(this: Record<string, unknown>) {
          return (this[passwordIvar] as string | null | undefined) ?? null;
        },
        set(this: Record<string, unknown>, unencryptedPassword: unknown) {
          if (unencryptedPassword == null) {
            this[passwordIvar] = null;
            publicSendWriter(this, digestAttr, null);
          } else if ((unencryptedPassword as string).length !== 0) {
            this[passwordIvar] = unencryptedPassword;
            const cost = SecurePassword.minCost
              ? TopLevel.BCrypt!.Engine.MIN_COST
              : TopLevel.BCrypt!.Engine.cost;
            publicSendWriter(
              this,
              digestAttr,
              TopLevel.BCrypt!.Password.create(unencryptedPassword, { cost }),
            );
          }
        },
        configurable: true,
      });

      Object.defineProperty(mod, `${attribute}Confirmation`, {
        get(this: Record<string, unknown>) {
          return this[confirmationIvar] ?? null;
        },
        set(this: Record<string, unknown>, value: unknown) {
          this[confirmationIvar] = value;
        },
        configurable: true,
      });

      Object.defineProperty(mod, `${attribute}Challenge`, {
        get(this: Record<string, unknown>) {
          return this[challengeIvar] ?? null;
        },
        set(this: Record<string, unknown>, value: unknown) {
          this[challengeIvar] = value;
        },
        configurable: true,
      });
    });

    const authenticateAttribute = function (this: Model, unencryptedPassword: unknown) {
      const attributeDigest = publicSend(this, digestAttr) as string | null;
      return (
        isPresent(attributeDigest) &&
        new TopLevel.BCrypt!.Password(attributeDigest as string).isPassword(unencryptedPassword) &&
        this
      );
    };
    this.defineMethod(`authenticate${camelize(attribute)}`, authenticateAttribute);

    this.moduleEval((mod) => {
      Object.defineProperty(mod, `${attribute}Salt`, {
        get(this: Model) {
          const attributeDigest = publicSend(this, digestAttr) as string | null;
          return isPresent(attributeDigest)
            ? new TopLevel.BCrypt!.Password(attributeDigest as string).salt
            : null;
        },
        configurable: true,
      });
    });

    if (attribute === "password") this.defineMethod("authenticate", authenticateAttribute);

    if (options.resetToken) {
      this.moduleEval((mod) => {
        Object.defineProperty(mod, `${attribute}ResetToken`, {
          get(this: { generateTokenFor(purpose: string): string }) {
            return this.generateTokenFor(`${attribute}_reset`);
          },
          configurable: true,
        });
      });
    }
  }
}

function publicSendWriter(record: object, name: string, value: unknown): void {
  Reflect.set(record, name, value);
}
