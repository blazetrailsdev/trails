import { classAttribute, humanize, deepDup, isPlainObject } from "@blazetrails/activesupport";
import {
  except,
  isSymbol,
  kernelCatch,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjDup,
  rbObjRespondTo,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { MissingTranslation, type TranslateKey } from "@blazetrails/i18n";
import { I18n } from "./i18n.js";
import { ActiveModel } from "./namespaces.js";

type ModelBase = object | null;

interface ValidatableBase {
  readAttributeForValidation(attribute: string): unknown;
  modelName: { human(): string };
  constructor: ModelClass;
}

interface ModelClass {
  i18nScope?: string;
  modelName: { i18nKey: string };
  humanAttributeName(attr: string, options?: { default?: string; base?: ModelBase }): string;
  lookupAncestors(): ModelClass[];
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
  declare static i18nCustomizeFullMessage: boolean;

  static {
    classAttribute.call(this, "i18nCustomizeFullMessage", { default: false });
  }

  base: ModelBase;
  attribute: string;
  type: string;
  rawType: string | null;
  options: Record<string, unknown>;

  static fullMessage(attribute: string, message: string | null, base: ModelBase): string | null {
    if (attribute === "base") return message;

    const baseClass = (base as ValidatableBase).constructor;

    let defaults: unknown[];
    if (this.i18nCustomizeFullMessage && rbObjRespondTo(baseClass, "i18nScope")) {
      attribute = attribute.replace(/\[\d+\]/g, "");
      const parts = attribute.split(".");
      const attributeName = parts.pop() as string;
      const namespace = parts.length > 0 ? parts.join("/") : undefined;
      const attributesScope = `${baseClass.i18nScope}.errors.models`;

      if (namespace) {
        defaults = baseClass
          .lookupAncestors()
          .map((klass) => [
            `:${attributesScope}.${klass.modelName.i18nKey}/${namespace}.attributes.${attributeName}.format`,
            `:${attributesScope}.${klass.modelName.i18nKey}/${namespace}.format`,
          ]);
      } else {
        defaults = baseClass
          .lookupAncestors()
          .map((klass) => [
            `:${attributesScope}.${klass.modelName.i18nKey}.attributes.${attributeName}.format`,
            `:${attributesScope}.${klass.modelName.i18nKey}.format`,
          ]);
      }

      defaults = defaults.flat(Infinity);
    } else {
      defaults = [];
    }

    defaults.push(":errors.format");
    defaults.push("%{attribute} %{message}");

    let attrName: string = humanize(attribute.replace(/\.base$/, "").replace(/\./g, "_"));
    attrName = baseClass.humanAttributeName(attribute, {
      default: attrName,
      base,
    });

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

    const baseClass = (base as ValidatableBase).constructor;
    const value =
      attribute !== "base"
        ? (base as ValidatableBase).readAttributeForValidation(attribute)
        : undefined;

    options = {
      model: (base as ValidatableBase).modelName.human(),
      attribute: baseClass.humanAttributeName(attribute, { base }),
      value,
      object: base,
      ...options,
    };

    let defaults: unknown[];
    if (rbObjRespondTo(baseClass, "i18nScope")) {
      const i18nScope = baseClass.i18nScope;
      attribute = attribute.replace(/\[\d+\]/g, "");

      defaults = baseClass
        .lookupAncestors()
        .flatMap((klass) => [
          `:${i18nScope}.errors.models.${klass.modelName.i18nKey}.attributes.${attribute}.${typeName}`,
          `:${i18nScope}.errors.models.${klass.modelName.i18nKey}.${typeName}`,
        ]);
      defaults.push(`:${i18nScope}.errors.messages.${typeName}`);

      if (options.message == null || options.message === false) {
        const translation = kernelCatch(":exception", () =>
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
    type: string | null = ":invalid",
    options: Record<string, unknown> = {},
    rawType?: string | null,
  ) {
    this.base = base;
    this.attribute = attribute;
    this.rawType = rawType !== undefined ? rawType : type;
    this.type = type ?? ":invalid";
    this.options = options;
  }

  initializeDup(_other: Error): void {
    this.attribute = rbObjDup(this.attribute);
    this.rawType = rbObjDup(this.rawType);
    this.type = rbObjDup(this.type);
    this.options = deepDup(this.options);
  }

  get message(): string | null {
    if (this.rawType != null && this.rawType.startsWith(":")) {
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

  get fullMessage(): string | null {
    return (this.constructor as typeof Error).fullMessage(this.attribute, this.message, this.base);
  }

  match(
    attribute: string,
    type: string | null = null,
    options: Record<string, unknown> = {},
  ): boolean {
    if (this.attribute !== attribute || (type != null && this.type !== type)) {
      return false;
    }

    for (const [key, value] of Object.entries(options)) {
      if (!optionsEqual(this.options[key], value)) {
        return false;
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
  protected attributesForHash(): [ModelBase, string, string | null, Record<string, unknown>] {
    return [this.base, this.attribute, this.rawType, except(this.options, ...CALLBACKS_OPTIONS)];
  }

  /** @noRailsEquivalent CONVERGEABLE deep-dup-has-no-object-arm-so-classes-hand-write-it */
  deepDup(): this {
    return rbObjDup(this);
  }

  inspect(): string {
    return `#<${rbModName(this.constructor as typeof Error) ?? ""} attribute=${isSymbol(this.attribute) ? symbolToS(this.attribute) : this.attribute}, type=${isSymbol(this.type) ? symbolToS(this.type) : this.type}, options=${rbInspect(this.options)}>`;
  }
}

rbModConstSet(ActiveModel, "Error", Error);
