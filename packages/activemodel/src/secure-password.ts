import { humanize } from "@rails-ts/activesupport";
import { Model } from "./model.js";

export function hasSecurePassword(
  modelClass: typeof Model,
  attribute: string = "password",
  options: { validations?: boolean } = {},
) {
  const digestAttr = `${attribute}_digest`;
  const confirmationAttr = `${attribute}Confirmation`;
  const validations = options.validations !== false;

  if (!modelClass._attributeDefinitions.has(digestAttr)) {
    modelClass.attribute(digestAttr, "string");
  }

  const passwordCache = new WeakMap<object, string | null>();

  Object.defineProperty(modelClass.prototype, attribute, {
    get(this: Model) {
      return passwordCache.get(this) ?? null;
    },
    set(this: Model, value: unknown) {
      if (value === null || value === undefined) {
        passwordCache.set(this, null);
        this.writeAttribute(digestAttr, null);
        return;
      }
      const str = String(value);
      if (str === "" || str.trim() === "") {
        passwordCache.delete(this);
        return;
      }
      passwordCache.set(this, str);
      this.writeAttribute(digestAttr, hashPassword(str));
    },
    configurable: true,
  });

  Object.defineProperty(modelClass.prototype, confirmationAttr, {
    get(this: Model) {
      return this._attributes.get(confirmationAttr) ?? null;
    },
    set(this: Model, value: unknown) {
      this._attributes.set(confirmationAttr, value);
    },
    configurable: true,
  });

  const authMethodName = attribute === "password" ? "authenticate" : `authenticate_${attribute}`;
  Object.defineProperty(modelClass.prototype, authMethodName, {
    value: function (this: Model, unencryptedPassword: string) {
      const digest = this.readAttribute(digestAttr) as string | null;
      if (!digest) return false;
      return digest === hashPassword(unencryptedPassword) ? this : false;
    },
    writable: true,
    configurable: true,
  });

  if (validations) {
    modelClass.validate((record: any) => {
      const pwd = passwordCache.get(record);
      const digest = record.readAttribute(digestAttr);

      if (!digest && (pwd === undefined || pwd === null)) {
        record.errors.add(attribute, "blank");
      }

      if (pwd !== null && pwd !== undefined) {
        if (pwd.length > 72) {
          record.errors.add(attribute, "too_long", { count: 72 });
        }

        const humanAttr = modelClass.humanAttributeName
          ? modelClass.humanAttributeName(attribute)
          : humanize(attribute);
        const confirmation = record._attributes.get(confirmationAttr);
        if (confirmation !== undefined && confirmation !== null && pwd !== confirmation) {
          record.errors.add(attribute, "confirmation", { attribute: humanAttr });
        }
      }
    });
  }
}

/**
 * Simple password hashing using Web Crypto-style approach.
 * NOT cryptographically secure — uses a basic string hash for test/dev purposes.
 * In production, replace with bcrypt/scrypt/argon2.
 */
function hashPassword(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `$hash$${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}
