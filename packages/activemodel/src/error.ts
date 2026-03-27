import { humanize } from "@blazetrails/activesupport";
import { I18n } from "./i18n.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

/**
 * Represents one single error.
 *
 * Mirrors: ActiveModel::Error
 */
export class Error {
  readonly base: AnyRecord;
  readonly attribute: string;
  readonly type: string;
  readonly rawType: string;
  readonly options: Record<string, unknown>;

  constructor(
    base: AnyRecord,
    attribute: string,
    type: string = "invalid",
    options: Record<string, unknown> = {},
  ) {
    this.base = base;
    this.attribute = attribute;
    this.rawType = type;
    this.type = type || "invalid";
    this.options = options;
  }

  get message(): string {
    const msg = this.options.message;
    if (typeof msg === "string") {
      return Error.interpolate(msg, this.options);
    }
    if (typeof msg === "function") {
      const result = (msg as (base: AnyRecord) => unknown)(this.base);
      if (typeof result === "string") return Error.interpolate(result, this.options);
    }
    return Error.generateMessage(this.attribute, this.type, this.base, this.options);
  }

  get details(): Record<string, unknown> {
    const result: Record<string, unknown> = { error: this.rawType };
    for (const [key, value] of Object.entries(this.options)) {
      if (
        key !== "if" &&
        key !== "unless" &&
        key !== "on" &&
        key !== "allow_nil" &&
        key !== "allow_blank" &&
        key !== "allowNil" &&
        key !== "allowBlank" &&
        key !== "strict" &&
        key !== "message"
      ) {
        result[key] = value;
      }
    }
    return result;
  }

  get detail(): Record<string, unknown> {
    return this.details;
  }

  get fullMessage(): string {
    return Error.fullMessage(this.attribute, this.message, this.base);
  }

  match(attribute: string, type?: string): boolean {
    if (this.attribute !== attribute) return false;
    if (type !== undefined && this.type !== type) return false;
    return true;
  }

  strictMatch(attribute: string, type: string, options?: Record<string, unknown>): boolean {
    if (!this.match(attribute, type)) return false;
    if (!options) return true;
    for (const [key, value] of Object.entries(options)) {
      if (this.options[key] !== value) return false;
    }
    return true;
  }

  equals(other: Error): boolean {
    return (
      other instanceof Error &&
      this.base === other.base &&
      this.attribute === other.attribute &&
      this.rawType === other.rawType
    );
  }

  inspect(): string {
    let optionsStr: string;
    try {
      optionsStr = JSON.stringify(this.options);
    } catch {
      optionsStr = "{...}";
    }
    return `#<ActiveModel::Error attribute=${this.attribute}, type=${this.type}, options=${optionsStr}>`;
  }

  static interpolate(msg: string, options: Record<string, unknown>): string {
    return msg.replace(/%\{(\w+)\}/g, (_, key) => {
      return options[key] !== undefined ? String(options[key]) : `%{${key}}`;
    });
  }

  static fullMessage(attribute: string, message: string, base: AnyRecord): string {
    if (attribute === "base") return message;
    const modelClass = base?.constructor;
    const humanAttr = modelClass?.humanAttributeName
      ? modelClass.humanAttributeName(attribute)
      : humanize(attribute);
    const format = I18n.t("activemodel.errors.format", {
      defaultValue: "%{attribute} %{message}",
    });
    return format.replace("%{attribute}", humanAttr).replace("%{message}", message);
  }

  static generateMessage(
    attribute: string,
    type: string,
    base: AnyRecord,
    options: Record<string, unknown> = {},
  ): string {
    if (typeof options.message === "string") {
      return Error.interpolate(options.message, options);
    }

    const modelClass = base?.constructor;
    const modelKey = modelClass?.name
      ? modelClass.name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()
      : undefined;
    const humanAttr = modelClass?.humanAttributeName
      ? modelClass.humanAttributeName(attribute)
      : humanize(attribute);

    const i18nOptions: Record<string, unknown> = {
      ...options,
      model: modelKey,
      attribute: humanAttr,
      value: base && attribute !== "base" ? base[attribute] : undefined,
    };

    const defaults: Array<{ key: string } | { message: string }> = [];
    if (modelKey) {
      defaults.push({
        key: `activemodel.errors.models.${modelKey}.attributes.${attribute}.${type}`,
      });
      defaults.push({ key: `activemodel.errors.models.${modelKey}.${type}` });
    }
    defaults.push({ key: `activemodel.errors.messages.${type}` });
    defaults.push({ key: `errors.attributes.${attribute}.${type}` });
    defaults.push({ key: `errors.messages.${type}` });

    const primaryKey = modelKey
      ? `activemodel.errors.models.${modelKey}.attributes.${attribute}.${type}`
      : `activemodel.errors.messages.${type}`;

    return I18n.t(primaryKey, {
      ...i18nOptions,
      defaults: defaults.slice(1),
      defaultValue: type,
    });
  }
}
