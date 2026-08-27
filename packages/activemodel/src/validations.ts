import {
  classAttribute,
  defineCallbacks,
  extend,
  include,
  included,
  kernelArray,
  runCallbacks,
} from "@blazetrails/activesupport";

import { Errors } from "./errors.js";
import { BlockValidator, EachValidator, Validator } from "./validator.js";
import type { ValidatableRecord } from "./validator.js";
import { I18n } from "./i18n.js";
import { freeze as attributesFreeze, type AttributeInstanceHost } from "./attributes.js";

import { Translation, raiseOnMissingTranslations as translationRaise } from "./translation.js";
import { HelperMethods } from "./validations/helper-methods.js";
import {
  ClassMethods as WithClassMethods,
  validatesWith as withValidatesWith,
} from "./validations/with.js";
import * as Validates from "./validations/validates.js";
import { ArgumentError, NoMethodError } from "./attribute-assignment.js";
import type { CallbackFn, CallbackConditions } from "./callbacks.js";
import {
  Callbacks,
  _defineBeforeModelCallback as _defineBeforeModelCallbackImpl,
  _defineAroundModelCallback as _defineAroundModelCallbackImpl,
  _defineAfterModelCallback as _defineAfterModelCallbackImpl,
} from "./callbacks.js";

/**
 * Rails: ActiveModel::Validations does `extend ActiveModel::Callbacks`
 * (validations.rb:42), so the three private callback definers surface
 * on Validations as well. Re-expose them here so api-compare matches
 * the shape of `validations.rb` and so a host that mixes in only
 * Validations still has the helpers available.
 *
 * @internal Rails-private helper.
 */
export const _defineBeforeModelCallback = _defineBeforeModelCallbackImpl;

/**
 * @internal Rails-private helper.
 */
export const _defineAroundModelCallback = _defineAroundModelCallbackImpl;

/**
 * @internal Rails-private helper.
 */
export const _defineAfterModelCallback = _defineAfterModelCallbackImpl;

/**
 * Mirrors: ActiveModel::Validations
 * (validations.rb:437 `alias :read_attribute_for_validation :send`).
 *
 * The literal translation of `send(attr)`: dispatch the public reader named
 * after the attribute. trails exposes declared attributes as value-returning
 * getters (which read the attribute store, exactly like the generated reader
 * Rails' `send` would call) and custom readers as methods, so a function member
 * is invoked (Ruby `send(:full_name)`) and a value member returned directly. A
 * plain getter with no declared attribute is therefore honored, not read as nil.
 * A name that resolves to no reader raises, mirroring Ruby `send`'s
 * `NoMethodError` (a typo'd / undeclared validation attribute fails loud rather
 * than validating a nil-ish value). `EachValidator` dispatches through any
 * instance override (validator.ts).
 */
export function readAttributeForValidation(
  this: ReadAttributeForValidationHost,
  attribute: string,
): unknown {
  // Ruby `send` keys off method *existence* (`respond_to?`), not the return
  // value: a reader that exists and returns nil yields nil, only a name with
  // no reader raises NoMethodError. `key in this` is the JS analog — it sees
  // own data properties, getters, and inherited methods up the prototype chain.
  if (!(attribute in this)) {
    const klass = (this.constructor as { name?: string } | undefined)?.name ?? "object";
    throw new NoMethodError(`undefined method '${attribute}' for an instance of ${klass}`);
  }
  const reader = this[attribute];
  return typeof reader === "function" ? (reader as () => unknown).call(this) : reader;
}

/**
 * Host shape consumed by `initInternals`. Kept loose so any class with
 * the validation-related fields satisfies it without circular imports
 * back to `Model`.
 */
export interface ValidationsInternalsHost<TBase extends object = object> {
  errors: Errors<TBase>;
  _validationContext: string | string[] | null;
  _contextForValidation?: ValidationContext;
}

/**
 * Lazy per-instance accessor for the active `ValidationContext`.
 * Mirrors Rails
 * `def context_for_validation; @context_for_validation ||= ValidationContext.new; end`
 * (activemodel/lib/active_model/validations.rb:463-465). The returned object owns
 * the active context — Rails keeps it here, not in a model ivar (:503-505, :361-368),
 * which is what lets a frozen model be validated.
 *
 * @internal Rails-private helper.
 */
export function contextForValidation(this: ContextForValidationHost): ValidationContext {
  if (this._contextForValidation) return this._contextForValidation;
  const vc = new ValidationContext();
  this._contextForValidation = vc;
  return vc;
}

/** The class Ruby's `included(base)` hook receives (validations.rb:40). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
type IncludingClass = (new (...args: any[]) => any) & { prototype: object };

/**
 * Mirrors: ActiveModel::Validations (validations.rb:37) — the instance half,
 * which `include(Model, Validations)` installs. A class module rather than a
 * plain object because Ruby's `validation_context` reader (:454) ports as an
 * accessor property, and only a prototype carries accessors across `include()`.
 */
export class Validations {
  /**
   * Rails' `included do` block (validations.rb:40-50). The `extend`s at :41-43
   * install what their modules already export: `define_model_callbacks`
   * (callbacks.rb:72) and the whole of Translation — `human_attribute_name`,
   * `lookup_ancestors` and `i18n_scope` (translation.rb:20, :27, :44).
   */
  static [included](base: IncludingClass): void {
    // `ActiveSupport::Concern#append_features` extends `ClassMethods` before it
    // class_evals the `included do` block, so the macros land first. Ruby's
    // reopenings of the same module (`validations/with.rb:87`,
    // `validations/validates.rb:110`) ride along on the one `extend`; each
    // reopening lives in the `.ts` matching its `.rb`, so they are separate
    // `extend()` calls here.
    extend(base, ClassMethods);
    extend(base, WithClassMethods);
    extend(base, {
      validates: Validates.validates,
      validatesBang: Validates.validatesBang,
      _validatesDefaultKeys: Validates._validatesDefaultKeys,
      _parseValidatesOptions: Validates._parseValidatesOptions,
    });

    extend(base, Callbacks);
    extend(base, Translation);
    extend(base, HelperMethods);
    include(base, HelperMethods);
    defineCallbacks(base.prototype, "validate", { scope: ["name"] });
    classAttribute.call(base, "_validators", { instanceWriter: false, default: new Map() });

    // The module's own instance methods that this file (and
    // `validations/with.rb:144-151`) declares as free functions rather than on
    // the `Validations` prototype — `include()` copies a class module's
    // prototype, so these need the second call.
    include(base, {
      contextForValidation,
      runValidationsBang,
      raiseValidationError,
      readAttributeForValidation,
      freeze,
      validatesWith: withValidatesWith,
    });
  }

  declare errors: Errors;
  /** @internal */
  declare contextForValidation: () => ValidationContext;
  /** @internal */
  declare runValidationsBang: () => Promise<boolean>;
  declare raiseValidationError: () => never;

  /**
   * Mirrors: ActiveModel::Validations#valid? (validations.rb:361-368). The
   * `run_callbacks(:validation)` wrapper is Rails'
   * `Validations::Callbacks#run_validations!` override (validations/callbacks.rb:113-115);
   * a halted chain returns `false` where Ruby's `throw :abort` unwinds.
   */
  async isValid(context?: string | string[] | ValidationContext | null): Promise<boolean> {
    const currentContext = this.validationContext;
    // Rails assigns the Symbol (or Array of Symbols) straight through; trails
    // also accepts a `ValidationContext`, and copies an Array so a caller's
    // later mutation cannot reach in.
    const inner = context instanceof ValidationContext ? context.context : (context ?? null);
    this.contextForValidation().context = Array.isArray(inner) ? [...inner] : inner;
    this.errors.clear();

    try {
      const completed = await runCallbacks(this, "validation", async () => {
        await this.runValidationsBang();
        return true;
      });
      if (!completed) return false;
      return this.errors.empty;
    } finally {
      this.contextForValidation().context = currentContext;
    }
  }

  /**
   * Mirrors Rails `alias_method :validate, :valid?` (validations.rb:370) — the
   * assignment below this class body is that alias.
   */
  declare validate: (context?: string | string[] | ValidationContext | null) => Promise<boolean>;

  /**
   * Mirrors Rails `def invalid?(context = nil); !valid?(context); end`
   * (validations.rb:408-410).
   */
  async isInvalid(context?: string | string[] | ValidationContext | null): Promise<boolean> {
    return !(await this.isValid(context));
  }

  /**
   * Run validations; return `true` or raise `ValidationError`. Mirrors Rails
   * `def validate!(context = nil); valid?(context) || raise_validation_error; end`
   * (validations.rb:417-419) — never returns false.
   */
  async validateBang(context?: string | string[] | ValidationContext | null): Promise<true> {
    if (!(await this.isValid(context))) {
      this.raiseValidationError();
    }
    return true;
  }

  /**
   * Mirrors Rails `def validation_context; context_for_validation.context; end`
   * (validations.rb:454-456) — a Symbol, an Array of Symbols, or `null`.
   */
  get validationContext(): string | string[] | null {
    return this.contextForValidation().context;
  }

  /**
   * Mirrors Rails' private `def validation_context=(context)` (validations.rb:459-461).
   * Rails has no `@validation_context` ivar — the context lives on the
   * `ValidationContext`, which is what lets a frozen model be validated.
   *
   * @internal
   */
  get _validationContext(): string | string[] | null {
    return this.contextForValidation().context;
  }

  /** @internal */
  set _validationContext(value: string | string[] | null) {
    this.contextForValidation().context = value;
  }

  /**
   * The `_run_validate_callbacks` that Rails' `define_callbacks :validate`
   * (validations.rb:48) generates and `run_validations!` (:473) sends; trails'
   * `defineCallbacks` generates none, so the body is spelled out here.
   *
   * @internal Rails-private helper.
   */
  async _runValidateCallbacks(): Promise<void> {
    await runCallbacks(this, "validate");
  }
}

// Rails `alias_method :validate, :valid?` (validations.rb:370).
Validations.prototype.validate = Validations.prototype.isValid;

/** Anything `validates_with` accepts — a `Validator` subclass or a bare `validate(record)`. */
type ValidatorLike = Validator | EachValidator | { validate(record: ValidatableRecord): unknown };

/** The class-level surface `ClassMethods` self-sends. */
export interface ValidationsClassHost {
  _validators: Map<string | null, ValidatorLike[]>;
  _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  validatesWith(...args: unknown[]): void;
  validate(
    methodOrFn: string | ((record: ValidatableRecord) => unknown),
    options?: ConditionalOptions,
  ): void;
  setCallback(name: string, fn: (record: object) => unknown, options: CallbackConditions): void;
  resetCallbacks(name: string): void;
  /** @internal */
  predicateForValidationContext(
    context: string | string[],
  ): (model: ValidationsContextHost) => boolean;
}

/** Mirrors: ActiveModel::Validations::ClassMethods (validations.rb:57). */
export const ClassMethods = {
  /**
   * Mirrors `def validates_each(*attr_names, &block)` —
   * `validates_with BlockValidator, _merge_attributes(attr_names), &block`
   * (validations.rb:88-90). `_merge_attributes` flattens (a nested
   * `[:title, :content]` contributes its members again) and pops the trailing
   * options hash, which trails takes as its own parameter so the block stays last.
   */
  validatesEach<T extends ValidatableRecord = ValidatableRecord>(
    this: ValidationsClassHost,
    attrNames: Array<string | string[]>,
    block: (record: T, attribute: string, value: unknown) => void,
    options: ConditionalOptions = {},
  ): void {
    this.validatesWith(BlockValidator, this._mergeAttributes([...attrNames, options]), block);
  },

  /**
   * Mirrors `def validate(*args, &block)` (validations.rb:160-185). The key
   * check runs only under `args.all?(Symbol)` — a block validator may carry
   * validator-ish keys. An unknown method name is a `send`-dispatched callback
   * filter, so it raises `NoMethodError` at validation time, not registration
   * time. `on:` merges into `:if` (:170-172) and `except_on:` into `:unless` as
   * an intersection of `Array(except_on)` with `Array(o.validation_context)`
   * (:174-182), so a nil context never intersects and the validator still runs.
   */
  validate<T extends ValidatableRecord = ValidatableRecord>(
    this: ValidationsClassHost,
    methodOrFn: string | ((record: T) => unknown),
    options: ConditionalOptions = {},
  ): void {
    if (typeof methodOrFn === "string") {
      for (const k of Object.keys(options)) {
        if (!(VALID_OPTIONS_FOR_VALIDATE as readonly string[]).includes(k)) {
          throw new ArgumentError(
            `Unknown key: :${k}. Valid keys are: ${VALID_OPTIONS_FOR_VALIDATE.map((v) => `:${v}`).join(", ")}. Perhaps you meant to call \`validates\` instead of \`validate\`?`,
          );
        }
      }
    }

    const fn: CallbackFn = (record: object) => {
      // Rails' filter (validations.rb:184) returns the method's value; trails
      // returns it too so a Promise-returning validator reaches the callback
      // runner, which awaits it (RFC 0063), rather than being dropped.
      const r = record as T & Record<string, unknown>;
      if (typeof methodOrFn === "function") {
        // Bind `this` to the record so block validators written as
        // `function () { this.foo }` (Rails `instance_exec`) resolve `this`.
        return methodOrFn.call(r, r) as void;
      } else if (typeof r[methodOrFn] === "function") {
        return (r[methodOrFn] as () => void)();
      }
      throw new NoMethodError(
        `undefined method '${methodOrFn}' for an instance of ${r.constructor.name}`,
      );
    };
    let ifConds = kernelArray(options.if as CallbackConditions["if"]);
    let unlessConds = kernelArray(options.unless as CallbackConditions["unless"]);

    if (options.on !== undefined) {
      const pred = this.predicateForValidationContext(options.on);
      ifConds = [(record: object) => pred(record as ValidationsContextHost), ...ifConds];
    }

    if (options.exceptOn !== undefined) {
      const exceptOn = kernelArray(options.exceptOn);
      unlessConds = [
        (record: object) => {
          const current = kernelArray(
            (record as unknown as ValidationsContextHost).validationContext,
          );
          return exceptOn.some((c) => current.includes(c));
        },
        ...unlessConds,
      ];
    }

    this.setCallback("validate", fn, {
      ...(ifConds.length > 0 ? { if: ifConds } : {}),
      ...(unlessConds.length > 0 ? { unless: unlessConds } : {}),
      ...(options.prepend ? { prepend: true } : {}),
    });
  },

  /** Mirrors `def validators; _validators.values.flatten.uniq; end` (validations.rb:204-206). */
  validators(this: ValidationsClassHost): ValidatorLike[] {
    const seen = new Set<ValidatorLike>();
    const out: ValidatorLike[] = [];
    for (const bucket of this._validators.values()) {
      for (const v of bucket) {
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
    }
    return out;
  },

  /**
   * Mirrors `def clear_validators!; reset_callbacks(:validate); _validators.clear; end`
   * (validations.rb:246-249). Ruby empties the Hash the `inherited` hook dupped
   * onto this class; `class_attribute`'s writer is local to the class, so
   * assigning an empty Map is that same class-local clear.
   */
  clearValidatorsBang(this: ValidationsClassHost): void {
    this.resetCallbacks("validate");
    this._validators = new Map();
  },

  /**
   * Mirrors `attributes.flat_map { |attribute| _validators[attribute.to_sym] }`
   * (validations.rb:266-270). Deliberately does NOT mirror Rails' default-proc
   * auto-vivification (`Hash.new { |h,k| h[k] = [] }`) — a Ruby hash artifact
   * that would turn a read into a state mutation.
   */
  validatorsOn(this: ValidationsClassHost, ...attributes: string[]): ValidatorLike[] {
    return attributes.flatMap((attribute) => this._validators.get(attribute) ?? []);
  },

  /**
   * Build the `if`-predicate that gates a validator on a validation context.
   * Mirrors Rails' private `predicate_for_validation_context(context)`
   * (validations.rb:296-306), memoized in the module-level
   * `@@predicates_for_validation_contexts` (:294).
   *
   * @internal Rails-private helper.
   */
  predicateForValidationContext(
    context: string | string[],
  ): (model: ValidationsContextHost) => boolean {
    const arr = Array.isArray(context) ? [...context].sort() : [context];
    const key = JSON.stringify(arr);
    let cached = _predicatesForValidationContexts.get(key);
    if (!cached) {
      cached = (model: ValidationsContextHost): boolean => {
        const mc = model.validationContext;
        if (Array.isArray(mc)) {
          return mc.some((c) => arr.includes(c));
        }
        return mc !== null && mc !== undefined && arr.includes(mc);
      };
      _predicatesForValidationContexts.set(key, cached);
    }
    return cached;
  },
};

/** Minimum shape required by ValidationError. */
export interface ModelWithErrors {
  errors: { fullMessages: string[] };
}

/**
 * Raised by validateBang when validation fails.
 *
 * Mirrors: ActiveModel::ValidationError
 */
export class ValidationError<TModel extends ModelWithErrors = ModelWithErrors>
  extends globalThis.Error
{
  readonly model: TModel;

  // Mirrors Rails `ActiveModel::ValidationError#initialize`
  // (activemodel/lib/active_model/validations.rb:496-500):
  //
  //   def initialize(model)
  //     @model = model
  //     errors = @model.errors.full_messages.join(", ")
  //     super(I18n.t(:"#{@model.class.i18n_scope}.errors.messages.model_invalid",
  //                  errors: errors, default: :"errors.messages.model_invalid"))
  //   end
  //
  constructor(model: TModel) {
    const errors = model.errors.fullMessages.join(", ");
    const rawScope = (model as { constructor?: { i18nScope?: unknown } }).constructor?.i18nScope;
    const scope = typeof rawScope === "string" ? rawScope : "activemodel";
    const message = I18n.t(`${scope}.errors.messages.model_invalid`, {
      errors,
      default: ":errors.messages.model_invalid",
    }) as string;
    super(message);
    this.name = "ValidationError";
    this.model = model;
  }
}

/**
 * Holds the active validation context for a model. Mirrors Rails
 * `class ValidationContext; attr_accessor :context; end`
 * (activemodel/lib/active_model/validations.rb:503-505) — a thin
 * mutable holder whose `context` can be a single symbol or an Array
 * of symbols (see `predicate_for_validation_context`, :294-306).
 *
 * Kept backward-compatible: the old `new ValidationContext("create")`
 * still works and `.name` + `.toString()` continue to return the first
 * segment as a string. `.context` is now `string | string[] | null`.
 */
export class ValidationContext {
  private _context: string | string[] | null;

  constructor(context: string | string[] | null = null) {
    this._context = context;
  }

  get context(): string | string[] | null {
    return this._context;
  }

  set context(value: string | string[] | null) {
    this._context = value;
  }

  /**
   * First-segment string form of the current context — live getter so it
   * stays consistent with `.context` after mutation via the setter.
   * `""` when the context is null.
   */
  get name(): string {
    const c = this._context;
    return Array.isArray(c) ? (c[0] ?? "") : (c ?? "");
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Module-level cache for predicate functions keyed by sorted context
 * arrays. Mirrors Rails `@@predicates_for_validation_contexts = {}`
 * (activemodel/lib/active_model/validations.rb:294) — a class variable
 * shared across all hosts that include Validations.
 *
 * @internal Rails-private state.
 */
const _predicatesForValidationContexts = new Map<
  string,
  (model: ValidationsContextHost) => boolean
>();

/**
 * Per-instance reset hook for validation state. Mirrors Rails
 * `ActiveModel::Validations#init_internals`
 * (activemodel/lib/active_model/validations.rb:467-471):
 *
 *   def init_internals
 *     super
 *     @errors = nil
 *     @context_for_validation = nil
 *   end
 *
 * Trails eagerly initializes `errors` (rather than Rails' lazy
 * `errors_or_create`), so this assigns a fresh `Errors` and clears
 * the active validation context. Ruby's `super` is `super_()`, the
 * receiver-bound link `prepend()` hands the module (model.ts wires the chain in
 * include order); the Model constructor enters it.
 *
 * @internal Rails-private helper.
 */
export function initInternals<TBase extends object>(
  this: ValidationsInternalsHost<TBase>,
  super_: () => void,
): void {
  super_();
  this.errors = new Errors(this as unknown as TBase);
  this._contextForValidation = undefined;
}

/**
 * Run the `:validate` callbacks and report whether the model has no
 * errors. Mirrors Rails
 * `def run_validations!; _run_validate_callbacks; errors.empty?; end`
 * (activemodel/lib/active_model/validations.rb:473-476).
 *
 * @internal Rails-private helper.
 */
export async function runValidationsBang(this: RunValidationsHost): Promise<boolean> {
  await this._runValidateCallbacks();
  return this.errors.empty;
}

/** Host shape the {@link freeze} link reads through. */
interface ValidationsFreezeHost {
  readonly errors: unknown;
  /** @internal */
  contextForValidation(): unknown;
}

/**
 * Throw `ValidationError` for the current model. Mirrors Rails
 * `def raise_validation_error; raise(ValidationError.new(self)); end`
 * (activemodel/lib/active_model/validations.rb:478-480).
 */
export function raiseValidationError<TBase extends object = object>(this: {
  errors: Errors<TBase>;
}): never {
  throw new ValidationError(this);
}

/**
 * Mirrors Rails `VALID_OPTIONS_FOR_VALIDATE` (validations.rb:92). The keys carry
 * their trails camelCase spelling (`exceptOn` for `:except_on`) — what a caller
 * actually passes, so what the raised message must name back to them.
 */
export const VALID_OPTIONS_FOR_VALIDATE = ["on", "if", "unless", "prepend", "exceptOn"] as const;

/**
 * Host shape consumed by `predicateForValidationContext`.
 */
export interface ValidationsContextHost {
  readonly validationContext: string | string[] | null;
}

/**
 * Mirrors Rails `ActiveModel::Validations#freeze` (validations.rb:372-377):
 *
 *   def freeze
 *     errors
 *     context_for_validation
 *     super
 *   end
 *
 * Rails pre-touches `@errors` and `@context_for_validation` so frozen models
 * can still answer `#errors` and `#validation_context` without tripping their
 * `||=` lazy-init. Trails mirrors that by reading `errors` and calling
 * `contextForValidation()` to populate its cached `ValidationContext`. The
 * `validationContext` getter alone is not enough — it doesn't write to
 * `_contextForValidation`, so a subsequent `contextForValidation()` call on the
 * frozen instance would throw on the cache assignment.
 *
 * `super` reaches `Attributes#freeze` (attributes.rb:150-153) and then Ruby's
 * `Object#freeze`; TS has no `super` across mixins, so this link runs both, the
 * way `attributes.freeze` already documents.
 */
export function freeze<T extends ValidationsFreezeHost>(this: T): T {
  void this.errors;
  void this.contextForValidation();
  // validations.rb:376 — `super` reaches `Attributes#freeze` (attributes.rb:150-153).
  attributesFreeze.call(this as unknown as AttributeInstanceHost);
  Object.freeze(this);
  return this;
}

/**
 * Host shape consumed by `contextForValidation`.
 */
export interface ContextForValidationHost {
  _validationContext: string | string[] | null;
  _contextForValidation?: ValidationContext;
}

/**
 * Host shape consumed by `runValidationsBang`.
 */
export interface RunValidationsHost<TBase extends object = object> {
  errors: Errors<TBase>;
  _runValidateCallbacks(): void | Promise<void>;
}

/** Host shape for the {@link readAttributeForValidation} mixin method. */
export interface ReadAttributeForValidationHost {
  [key: string]: unknown;
}

/**
 * Mirrors Rails `initialize_dup` (validations.rb:310-313), which nils `@errors`
 * and lets `errors_or_create` rebuild it lazily; trails initializes `errors`
 * eagerly, so this assigns the replacement, as {@link initInternals} does. Like
 * Rails it leaves `@context_for_validation` aliased to the source's — `valid?`
 * sets and restores the context per run, so the copy is never observed in
 * flight. Ruby's `super` is `super_()`, the receiver-bound link `prepend()`
 * hands the module — and as in Rails the replacement is assigned BEFORE it.
 */
export function initializeDup<TBase extends object>(
  this: ValidationsInternalsHost<TBase>,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  this.errors = new Errors(this as unknown as TBase);
  super_(other);
}

/**
 * Rails: ActiveModel::Validations extends Translation (validations.rb:43),
 * so the singleton accessor surfaces on Validations directly. Mirror that
 * here so callers can read/write via `Validations.raiseOnMissingTranslations(...)`.
 */
export function raiseOnMissingTranslations(value?: boolean): boolean {
  return translationRaise(value);
}

/**
 * A single `if:` / `unless:` condition — the Symbol-or-Proc filter Rails hands
 * straight to `set_callback` (validations.rb:160-185), resolved by
 * `ActiveSupport::Callbacks::CallTemplate` (callbacks.rb:326-331, :394-443).
 * A Ruby Symbol is spelled colon-prefixed: `if: ":conditionIsTrue"`.
 */
export type ConditionFn = ((record: ValidatableRecord) => boolean) | string;

/**
 * The option keys `validate` accepts (validations.rb:160-185) and that
 * `validates` forwards to each validator (validates.rb:162-164).
 *
 * @noRailsEquivalent PERMANENT (`vendor/rails/activemodel/lib/active_model/validations.rb:160-185`
 *   — `VALID_OPTIONS_FOR_VALIDATE`). Ruby's options hash needs no declaration;
 *   its keys are the members below.
 */
export interface ConditionalOptions {
  if?: ConditionFn | ConditionFn[];
  unless?: ConditionFn | ConditionFn[];
  /**
   * Validation context(s) under which this condition fires — a single
   * context name or an array. Mirrors Rails `on:` which accepts
   * `Symbol | Array<Symbol>` and intersects with the model's current
   * `validation_context` via `predicate_for_validation_context`
   * (activemodel/lib/active_model/validations.rb:294-306).
   */
  on?: string | string[];
  /**
   * Validation context(s) under which this condition is *skipped* — the inverse of
   * `on:`. Mirrors Rails `except_on:` (validations.rb:175-182).
   */
  exceptOn?: string | string[];
  /** Register ahead of the already-registered validate callbacks. */
  prepend?: boolean;
}
