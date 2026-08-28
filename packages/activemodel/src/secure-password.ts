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

export function hasSecurePassword(
  this: typeof Model,
  attribute: string = "password",
  options: { validations?: boolean; resetToken?: boolean } = {},
) {
  const validations = options.validations !== false;
  const resetToken = options.resetToken !== false;
  const digestAttr = `${attribute}_digest`;
  const challengeAttr = `${attribute}Challenge`;

  include(
    this as unknown as new (...args: unknown[]) => unknown,
    new InstanceMethodsOnActivation(attribute, { resetToken }),
  );

  if (validations) {
    this.validate((record: Model) => {
      if (isBlank(publicSend(record, digestAttr))) record.errors.add(attribute, ":blank");
    });

    this.validate((record: Model & { respondTo(method: string): boolean }) => {
      const challenge = publicSend(record, challengeAttr);
      if (challenge != null && challenge !== false) {
        const digestWas = record.respondTo(`${digestAttr}Was`)
          ? (publicSend(record, `${digestAttr}Was`) as string | null | undefined)
          : undefined;
        if (isBlank(digestWas) || !bcrypt.compareSync(String(challenge), digestWas as string)) {
          record.errors.add(challengeAttr);
        }
      }
    });

    this.validate((record: Model) => {
      const passwordValue = publicSend(record, attribute) as string | null;
      if (
        !isBlank(passwordValue) &&
        textEncoder.encode(passwordValue as string).length > MAX_PASSWORD_LENGTH_ALLOWED
      ) {
        record.errors.add(attribute, ":password_too_long");
      }
    });

    this.validatesConfirmationOf(attribute, { allowBlank: true });
  }

  const tokenHost = this as unknown as TokenHost;
  if (resetToken && typeof tokenHost.generatesTokenFor === "function") {
    tokenHost.generatesTokenFor(`${attribute}_reset`, {
      expiresIn: 15 * 60,
      block: (record: Model) => {
        const salt = publicSend(record, `${attribute}Salt`) as string | null;
        return salt?.slice(-10) ?? null;
      },
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
    options: { expiresIn?: number; block?: (record: Model) => unknown },
  ) => void;
  findByTokenFor?: (purpose: string, token: string) => unknown;
  findByTokenForBang?: (purpose: string, token: string) => unknown;
}

function publicSend(record: Model, name: string): unknown {
  return (record as unknown as Record<string, unknown>)[name];
}

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
          return challengeIvar.has(this) ? challengeIvar.get(this) : null;
        },
        set(this: Model, value: unknown) {
          challengeIvar.set(this, value);
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

function publicSendWriter(record: Model, name: string, value: string | null): void {
  (record as unknown as Record<string, unknown>)[name] = value;
}
