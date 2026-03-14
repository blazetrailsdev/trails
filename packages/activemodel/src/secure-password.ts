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
      if (str === "" || str.trim() === "") return;
      passwordCache.set(this, str);
      this.writeAttribute(digestAttr, simpleHash(str));
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

  Object.defineProperty(modelClass.prototype, "authenticate", {
    value: function (this: Model, unencryptedPassword: string) {
      const digest = this.readAttribute(digestAttr) as string | null;
      if (!digest) return false;
      return digest === simpleHash(unencryptedPassword) ? this : false;
    },
    configurable: true,
  });

  if (validations) {
    modelClass.validate((record: any) => {
      const pwd = passwordCache.get(record);
      const digest = record.readAttribute(digestAttr);

      if (!digest && pwd === undefined) {
        record.errors.add(attribute, "blank");
      }

      if (pwd !== null && pwd !== undefined) {
        if (pwd.length > 72) {
          record.errors.add(attribute, "too_long", { count: 72 });
        }

        const confirmation = record._attributes.get(confirmationAttr);
        if (confirmation !== undefined && confirmation !== null && pwd !== confirmation) {
          record.errors.add(attribute, "confirmation", { attribute: "Password" });
        }
      }
    });
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `$simple$${hash.toString(16)}`;
}
