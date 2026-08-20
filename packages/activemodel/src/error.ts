import { humanize, deepDup, except } from "@blazetrails/activesupport";
import { MissingTranslation, catchException, type TranslateKey } from "@blazetrails/i18n";
import { I18n } from "./i18n.js";

/** The model instance that owns this error. Rails tests pass null for base-only errors. */
type ModelBase = object | null;

/** `ActiveModel::Validations#read_attribute_for_validation`, aliased to `send` in Rails. */
interface ValidatableBase {
  readAttributeForValidation(attribute: string): unknown;
}

/** Shape of a model class accessed for I18n/human-attribute lookups. */
interface ModelClass {
  name?: string;
  i18nScope?: string;
  modelName?: { i18nKey?: string; human?: () => string };
  humanAttributeName?: (attr: string, options?: { default?: string; base?: ModelBase }) => string;
  lookupAncestors?: () => ModelClass[];
}

// Rails `CALLBACKS_OPTIONS` / `MESSAGE_OPTIONS` — option keys that are
// stripped from the identity of an error for strict-match / hash purposes
// (activemodel/lib/active_model/error.rb:10-11). Both snake and camel
// spellings are accepted since our codebase normalizes to camel while
// Rails-ported code may leak snake-cased keys.
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

/**
 * Value equality that matches Ruby `==` for the common option shapes:
 * primitives (identity), arrays (elementwise), and plain objects (key-set +
 * recursive value equality). Rails relies on `Array#==` / `Hash#==` here
 * since option values like `in: [1,2,3]` / `count: 2..5` are frequently
 * collections, and reference equality in JS would silently fail to match.
 */
function optionsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!optionsEqual(a[i], b[i])) return false;
    return true;
  }
  // Ruby `Regexp#==` compares source + options. JS RegExp's enumerable keys
  // are empty, so the plain-object path below would always return true —
  // handle explicitly before it.
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof RegExp || b instanceof RegExp) return false;
  if (typeof a === "object" && typeof b === "object") {
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
  return false;
}

/**
 * Represents one single error.
 *
 * Mirrors: ActiveModel::Error
 */
export class Error {
  static i18nCustomizeFullMessage: boolean = false;

  // Rails exposes these as `attr_reader` over plain ivars (error.rb:101), which
  // `initialize_dup` (:111-115) and `Errors#copy!`'s
  // `instance_variable_set(:@base, ...)` (errors.rb:141) both write through.
  // TS has no `instance_variable_set` escape hatch from a `readonly` field, so
  // the ivars are declared writable exactly as Ruby has them.
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

  /**
   * @internal Rails-private helper (activemodel/lib/active_model/error.rb:64).
   */
  static generateMessage(
    attribute: string,
    type: string,
    base: ModelBase,
    options: Record<string, unknown> = {},
  ): string {
    const msgOpt = options.message;
    // error.rb:65 `type = options.delete(:message) if options[:message].is_a?(Symbol)`:
    // a Ruby Symbol keeps its leading colon, so a plain String stays in
    // `options[:message]` and becomes the default below, exactly as in Rails.
    if (typeof msgOpt === "string" && msgOpt.startsWith(":")) {
      const { message: _msg, ...rest } = options;
      type = msgOpt;
      options = rest;
    }
    const typeName = type.slice(1);

    const baseClass = base?.constructor as ModelClass | undefined;
    // error.rb:66. Rails aliases `read_attribute_for_validation` to `send`
    // (validations.rb:436), so a base that does not define it — a plain object,
    // which Ruby's base never is — is read as `send` would read it.
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
    // Rails `NestedError#initialize` keeps `@raw_type = inner_error.raw_type`
    // while allowing `@type` to be overridden via `override_options[:type]`
    // (activemodel/lib/active_model/nested_error.rb:8-15). Message
    // generation keys off `raw_type` so i18n lookups still resolve the
    // original error's key even when the surface `type` has been renamed.
    // `rawType` defaults to `type` for the common case where they match.
    this.rawType = rawType ?? type;
    this.type = type || ":invalid";
    this.options = options;
  }

  get message(): string {
    // Rails error.rb:136-141: dispatch on raw_type shape — Symbol → generate_message, else → literal.
    // A Ruby Symbol reaches us as a colon-prefixed string (`":blank"`), which is the discriminator.
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

  /**
   * See if this error matches `attribute`, `type`, and `options`. Mirrors
   * Rails `Error#match?` (activemodel/lib/active_model/error.rb:166-174):
   * subset match — every key in `options` must equal (Ruby `==`, i.e.
   * structural for Array/Hash, value-equal for primitives) the
   * corresponding value in `this.options`; extra keys on the error are
   * ignored. Not Ruby's case-equality (`===`), which would imply
   * RegExp/Range-style matching — Rails' `match?` uses `!=`.
   */
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

  /**
   * Strict match — Rails `Error#strict_match?`
   * (activemodel/lib/active_model/error.rb:184-190):
   *
   *   return false unless match?(attribute, type)
   *   options == @options.except(*CALLBACKS_OPTIONS + MESSAGE_OPTIONS)
   *
   * `optionsEqual` stands in for Ruby's `Hash#==`, which JS `===` does not
   * provide.
   */
  strictMatch(attribute: string, type: string, options?: Record<string, unknown>): boolean {
    if (!this.match(attribute, type)) return false;

    return optionsEqual(
      options ?? {},
      except(this.options, ...CALLBACKS_OPTIONS, ...MESSAGE_OPTIONS),
    );
  }

  equals(other: Error): boolean {
    if (!(other instanceof Error)) return false;
    const a = this.attributesForHash();
    const b = other.attributesForHash();
    if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) return false;
    return optionsEqual(a[3], b[3]);
  }

  /**
   * Identity tuple used by `==` and `hash`. Mirrors Rails
   * `attributes_for_hash` (activemodel/lib/active_model/error.rb:204-206):
   * `[@base, @attribute, @raw_type, @options.except(*CALLBACKS_OPTIONS)]`.
   *
   * @internal Rails-private helper.
   */
  protected attributesForHash(): [ModelBase, string, string, Record<string, unknown>] {
    return [this.base, this.attribute, this.rawType, except(this.options, ...CALLBACKS_OPTIONS)];
  }

  /**
   * Mirrors: ActiveModel::Error#initialize_dup
   * (activemodel/lib/active_model/error.rb:111-116):
   *
   *   def initialize_dup(other)
   *     @attribute = @attribute.dup
   *     @raw_type  = @raw_type.dup
   *     @type      = @type.dup
   *     @options   = @options.deep_dup
   *   end
   *
   * `@attribute` / `@raw_type` / `@type` are Ruby Strings, whose `dup` exists
   * to unshare mutable storage; a JS string is a primitive and already
   * unshared, so only the options hash needs the copy. `@base` is deliberately
   * left shared, as in Rails.
   */
  initializeDup(_other: Error): void {
    this.options = deepDup(this.options);
  }

  /**
   * Mirrors: `Object#deep_dup`
   * (activesupport/lib/active_support/core_ext/object/deep_dup.rb:29-31) —
   * `duplicable? ? dup : self`. JS has no `Object#dup`, so the shallow
   * class-preserving copy Ruby gets for free is spelled out, followed by the
   * `initialize_dup` hook Ruby runs for it.
   */
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
