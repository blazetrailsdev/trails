import { humanize, deepDup, isPlainObject } from "@blazetrails/activesupport";
import { except } from "@blazetrails/ruby-compat";
import { MissingTranslation, catchException, type TranslateKey } from "@blazetrails/i18n";
import { I18n } from "./i18n.js";

type ModelBase = object | null;

interface ValidatableBase {
  readAttributeForValidation(attribute: string): unknown;
}

interface ModelClass {
  name?: string;
  i18nScope?: string;
  modelName?: { i18nKey?: string; human?: () => string };
  humanAttributeName?: (attr: string, options?: { default?: string; base?: ModelBase }) => string;
  lookupAncestors?: () => ModelClass[];
}

const CALLBACKS_OPTIONS: string[] = [
  "if",
  "unless",
  "on",
  "allow_nil",
  "allow_blank",
  "strict",
  "allowNil",
  "allowBlank",
];
const MESSAGE_OPTIONS: string[] = ["message"];

function optionsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!optionsEqual(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof RegExp || b instanceof RegExp) return false;
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!optionsEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
        return false;
    }
    return true;
  }
  if (typeof (a as { equals?: unknown }).equals === "function") {
    return (a as { equals(other: unknown): boolean }).equals(b);
  }
  return false;
}

export class Error {
  static i18nCustomizeFullMessage: boolean = false;

  base: ModelBase;
  attribute: string;
  type: string;
  rawType: string;
  options: Record<string, unknown>;

  static fullMessage(attribute: string, message: string, base: ModelBase): string {
    if (attribute === "base") return message;

    const baseClass = base?.constructor as ModelClass | undefined;

    let defaults: unknown[];
    if (Error.i18nCustomizeFullMessage && baseClass?.i18nScope != null) {
      attribute = attribute.replace(/\[\d+\]/g, "");
      const parts = attribute.split(".");
      const attributeName = parts.pop() as string;
      const namespace = parts.length > 0 ? parts.join("/") : undefined;
      const attributesScope = `${baseClass.i18nScope}.errors.models`;

      if (namespace) {
        defaults = baseClass.lookupAncestors!().flatMap((klass) => [
          `:${attributesScope}.${klass.modelName!.i18nKey}/${namespace}.attributes.${attributeName}.format`,
          `:${attributesScope}.${klass.modelName!.i18nKey}/${namespace}.format`,
        ]);
      } else {
        defaults = baseClass.lookupAncestors!().flatMap((klass) => [
          `:${attributesScope}.${klass.modelName!.i18nKey}.attributes.${attributeName}.format`,
          `:${attributesScope}.${klass.modelName!.i18nKey}.format`,
        ]);
      }
    } else {
      defaults = [];
    }

    defaults.push(":errors.format");
    defaults.push("%{attribute} %{message}");

    let attrName: string = humanize(attribute.replace(/\.base$/, "").replace(/\./g, "_"));
    attrName = baseClass?.humanAttributeName
      ? baseClass.humanAttributeName(attribute, { default: attrName, base })
      : attrName;

    return I18n.t(defaults.shift() as TranslateKey, {
      default: defaults,
      attribute: attrName,
      message,
    }) as string;
  }

  static generateMessage(
    attribute: string,
    type: string,
    base: ModelBase,
    options: Record<string, unknown> = {},
  ): string {
    const msgOpt = options.message;
    if (typeof msgOpt === "string" && msgOpt.startsWith(":")) {
      const { message: _msg, ...rest } = options;
      type = msgOpt;
      options = rest;
    }
    const typeName = type.slice(1);

    const baseClass = base?.constructor as ModelClass | undefined;
    const value =
      attribute !== "base" && base != null
        ? "readAttributeForValidation" in base
          ? (base as ValidatableBase).readAttributeForValidation(attribute)
          : (base as Record<string, unknown>)[attribute]
        : undefined;

    options = {
      model: baseClass?.modelName?.human?.(),
      attribute: baseClass?.humanAttributeName
        ? baseClass.humanAttributeName(attribute, { base })
        : humanize(attribute),
      value,
      object: base,
      ...options,
    };

    let defaults: unknown[];
    if (baseClass?.i18nScope != null) {
      const i18nScope = baseClass.i18nScope;
      attribute = attribute.replace(/\[\d+\]/g, "");

      defaults = baseClass.lookupAncestors!().flatMap((klass) => [
        `:${i18nScope}.errors.models.${klass.modelName!.i18nKey}.attributes.${attribute}.${typeName}`,
        `:${i18nScope}.errors.models.${klass.modelName!.i18nKey}.${typeName}`,
      ]);
      defaults.push(`:${i18nScope}.errors.messages.${typeName}`);

      if (options.message == null || options.message === false) {
        const translation = catchException(() =>
          I18n.translate(defaults[0] as TranslateKey, {
            ...options,
            default: defaults.slice(1),
            throw: true,
          }),
        );
        if (!(translation instanceof MissingTranslation) && translation != null) {
          return translation as string;
        }
      }
    } else {
      defaults = [];
    }

    defaults.push(`:errors.attributes.${attribute}.${typeName}`);
    defaults.push(`:errors.messages.${typeName}`);

    const key = defaults.shift();
    if (options.message != null && options.message !== false) {
      defaults = [options.message];
      delete options.message;
    }
    options.default = defaults;

    return I18n.translate(key as TranslateKey, options) as string;
  }

  constructor(
    base: ModelBase,
    attribute: string,
    type: string = ":invalid",
    options: Record<string, unknown> = {},
    rawType?: string,
  ) {
    this.base = base;
    this.attribute = attribute;
    this.rawType = rawType ?? type;
    this.type = type || ":invalid";
    this.options = options;
  }

  get message(): string {
    if (this.rawType.startsWith(":")) {
      return Error.generateMessage(
        this.attribute,
        this.rawType,
        this.base,
        except(this.options, ...CALLBACKS_OPTIONS),
      );
    }
    return this.rawType;
  }

  get details(): Record<string, unknown> {
    return {
      error: this.rawType,
      ...except(this.options, ...CALLBACKS_OPTIONS, ...MESSAGE_OPTIONS),
    };
  }

  get detail(): Record<string, unknown> {
    return this.details;
  }

  get fullMessage(): string {
    return Error.fullMessage(this.attribute, this.message, this.base);
  }

  match(attribute: string, type?: string, options?: Record<string, unknown>): boolean {
    if (this.attribute !== attribute) return false;
    if (type !== undefined && this.type !== type) return false;
    if (options) {
      for (const [key, value] of Object.entries(options)) {
        if (!optionsEqual(this.options[key], value)) return false;
      }
    }
    return true;
  }

  strictMatch(attribute: string, type: string, options?: Record<string, unknown>): boolean {
    if (!this.match(attribute, type)) return false;

    return optionsEqual(
      options ?? {},
      except(this.options, ...CALLBACKS_OPTIONS, ...MESSAGE_OPTIONS),
    );
  }

  equals(other: Error): boolean {
    return (
      other instanceof this.constructor &&
      optionsEqual(this.attributesForHash(), other.attributesForHash())
    );
  }

  /** @internal */
  protected attributesForHash(): [ModelBase, string, string, Record<string, unknown>] {
    return [this.base, this.attribute, this.rawType, except(this.options, ...CALLBACKS_OPTIONS)];
  }

  initializeDup(_other: Error): void {
    this.options = deepDup(this.options);
  }

  deepDup(): this {
    const copy = Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this);
    copy.initializeDup(this);
    return copy;
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
}
