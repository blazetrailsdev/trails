import bcrypt from "bcryptjs";
import { humanize } from "@rails-ts/activesupport";
import { Model } from "./model.js";

const MIN_COST = 4;
const DEFAULT_COST = 12;

export const SecurePassword = {
  minCost: false,
};

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
      const cost = SecurePassword.minCost ? MIN_COST : DEFAULT_COST;
      this.writeAttribute(digestAttr, bcrypt.hashSync(str, cost));
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

  const camelAttr = attribute.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const authMethodName =
    attribute === "password"
      ? "authenticate"
      : `authenticate${camelAttr.charAt(0).toUpperCase()}${camelAttr.slice(1)}`;

  Object.defineProperty(modelClass.prototype, authMethodName, {
    value: function (this: Model, unencryptedPassword: string) {
      const digest = this.readAttribute(digestAttr) as string | null;
      if (!digest) return false;
      return bcrypt.compareSync(unencryptedPassword, digest) ? this : false;
    },
    writable: true,
    configurable: true,
  });

  if (validations) {
    modelClass.validate((record: Model) => {
      const pwd = passwordCache.get(record);
      const digest = record.readAttribute(digestAttr);

      if (!digest && (pwd === undefined || pwd === null)) {
        record.errors.add(attribute, "blank");
      }

      if (pwd !== null && pwd !== undefined) {
        if (new Blob([pwd]).size > 72) {
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
