import bcrypt from "bcryptjs";
import { humanize, camelize } from "@blazetrails/activesupport";
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
    hasSecurePassword(attribute?: string, options?: { validations?: boolean }): void;
  }
}

function setPassword(
  instance: Model,
  value: unknown,
  attribute: string,
  digestAttr: string,
  passwordCache: WeakMap<object, string | null>,
) {
  if (value === null || value === undefined) {
    passwordCache.set(instance, null);
    instance.writeAttribute(digestAttr, null);
    return;
  }
  const str = String(value);
  if (str === "") {
    return;
  }
  passwordCache.set(instance, str);
  const cost = SecurePassword.minCost ? MIN_COST : DEFAULT_COST;
  instance.writeAttribute(digestAttr, bcrypt.hashSync(str, cost));
}

export function hasSecurePassword(
  modelClass: typeof Model,
  attribute: string = "password",
  options: { validations?: boolean } = {},
) {
  const digestAttr = `${attribute}_digest`;
  const confirmationAttr = `${attribute}Confirmation`;
  const challengeAttr = `${attribute}Challenge`;
  const validations = options.validations !== false;

  if (!modelClass._attributeDefinitions.has(digestAttr)) {
    modelClass.attribute(digestAttr, "string");
  }

  const passwordCache = new WeakMap<object, string | null>();
  const previousDigestCache = new WeakMap<object, string | null>();
  const challengeCache = new WeakMap<object, string | null>();

  Object.defineProperty(modelClass.prototype, attribute, {
    get(this: Model) {
      return passwordCache.get(this) ?? null;
    },
    set(this: Model, value: unknown) {
      const willUpdateDigest = value === null || value === undefined || String(value) !== "";
      if (willUpdateDigest) {
        const currentDigest = this.readAttribute(digestAttr) as string | null;
        if (currentDigest) {
          previousDigestCache.set(this, currentDigest);
        } else {
          previousDigestCache.delete(this);
        }
      }
      setPassword(this, value, attribute, digestAttr, passwordCache);
    },
    configurable: true,
  });

  Object.defineProperty(modelClass.prototype, confirmationAttr, {
    get(this: Model) {
      return this.readAttribute(confirmationAttr);
    },
    set(this: Model, value: unknown) {
      this.writeAttribute(confirmationAttr, value);
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

  const authMethodName =
    attribute === "password" ? "authenticate" : `authenticate${camelize(attribute)}`;

  Object.defineProperty(modelClass.prototype, authMethodName, {
    value: function (this: Model, unencryptedPassword: unknown) {
      if (typeof unencryptedPassword !== "string" || !unencryptedPassword) return false;
      const digest = this.readAttribute(digestAttr) as string | null;
      if (!digest) return false;
      return bcrypt.compareSync(unencryptedPassword, digest) ? this : false;
    },
    writable: true,
    configurable: true,
  });

  modelClass.afterInitialize((record: Model) => {
    if (record._attributes.has(attribute)) {
      const plaintext = record.readAttribute(attribute);
      record._attributes.delete(attribute);
      setPassword(record, plaintext, attribute, digestAttr, passwordCache);
    }
  });

  if (validations) {
    modelClass.validate((record: Model) => {
      const pwd = passwordCache.get(record);
      const digest = record.readAttribute(digestAttr);

      if (!digest && (pwd === undefined || pwd === null)) {
        record.errors.add(attribute, "blank");
      }

      if (pwd !== null && pwd !== undefined) {
        if (textEncoder.encode(pwd).length > 72) {
          record.errors.add(attribute, "too_long", { count: 72 });
        }

        const humanAttr = modelClass.humanAttributeName
          ? modelClass.humanAttributeName(attribute)
          : humanize(attribute);
        const confirmation = record.readAttribute(confirmationAttr);
        if (confirmation !== undefined && confirmation !== null && pwd !== confirmation) {
          record.errors.add(attribute, "confirmation", { attribute: humanAttr });
        }
      }

      const challenge = challengeCache.get(record) ?? null;
      if (challenge !== null) {
        const currentDigest = record.readAttribute(digestAttr) as string | null;
        const digestToCheck = passwordCache.has(record)
          ? (previousDigestCache.get(record) ?? currentDigest)
          : currentDigest;
        if (!digestToCheck || !bcrypt.compareSync(challenge, digestToCheck)) {
          record.errors.add(challengeAttr, "invalid");
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
