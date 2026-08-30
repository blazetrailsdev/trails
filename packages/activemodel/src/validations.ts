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
import { inspectAccessor } from "./validations/_accessor.js";
import { BlockValidator, EachValidator, Validator } from "./validator.js";
import type { ValidatableRecord } from "./validator.js";
import { I18n } from "./i18n.js";

import { Naming } from "./naming.js";
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

/** @internal */
export const _defineBeforeModelCallback = _defineBeforeModelCallbackImpl;

/** @internal */
export const _defineAroundModelCallback = _defineAroundModelCallbackImpl;

/** @internal */
export const _defineAfterModelCallback = _defineAfterModelCallbackImpl;

export interface ValidationsInternalsHost<TBase extends object = object> {
  errors: Errors<TBase>;
  /** @internal */
  _errors?: Errors<TBase>;
  _validationContext: string | string[] | null;
  _contextForValidation?: ValidationContext;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
type IncludingClass = (new (...args: any[]) => any) & { prototype: object };

export class Validations {
  static [included](base: IncludingClass): void {
    include(base, InstanceMethods);

    include(base, { validatesWith: withValidatesWith });

    extend(base, ClassMethods);
    extend(base, WithClassMethods);
    extend(base, {
      validates: Validates.validates,
      validatesBang: Validates.validatesBang,
      _validatesDefaultKeys: Validates._validatesDefaultKeys,
      _parseValidatesOptions: Validates._parseValidatesOptions,
    });

    extend(base, Naming);
    extend(base, Callbacks);
    extend(base, Translation);
    extend(base, HelperMethods);
    include(base, HelperMethods);
    defineCallbacks(base.prototype, "validate", { scope: ["name"] });
    classAttribute.call(base, "_validators", { instanceWriter: false, default: new Map() });
  }

  declare errors: Errors;
  /** @internal */
  declare contextForValidation: () => ValidationContext;
  /** @internal */
  declare runValidationsBang: () => Promise<boolean>;
  declare raiseValidationError: () => never;

  async isValid(context?: string | string[] | ValidationContext | null): Promise<boolean> {
    const currentContext = this.validationContext;
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

  declare validate: (context?: string | string[] | ValidationContext | null) => Promise<boolean>;

  async isInvalid(context?: string | string[] | ValidationContext | null): Promise<boolean> {
    return !(await this.isValid(context));
  }

  async validateBang(context?: string | string[] | ValidationContext | null): Promise<true> {
    if (!(await this.isValid(context))) {
      this.raiseValidationError();
    }
    return true;
  }

  get validationContext(): string | string[] | null {
    return this.contextForValidation().context;
  }

  /** @internal */
  get _validationContext(): string | string[] | null {
    return this.contextForValidation().context;
  }

  /** @internal */
  set _validationContext(value: string | string[] | null) {
    this.contextForValidation().context = value;
  }

  /** @internal */
  async _runValidateCallbacks(): Promise<void> {
    await runCallbacks(this, "validate");
  }
}

Validations.prototype.validate = Validations.prototype.isValid;

type ValidatorLike = Validator | EachValidator | { validate(record: ValidatableRecord): unknown };

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

export const ClassMethods = {
  validatesEach<T extends ValidatableRecord = ValidatableRecord>(
    this: ValidationsClassHost,
    attrNames: Array<string | string[]>,
    block: (record: T, attribute: string, value: unknown) => void,
    options: ConditionalOptions = {},
  ): void {
    this.validatesWith(BlockValidator, this._mergeAttributes([...attrNames, options]), block);
  },

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
      const r = record as T & Record<string, unknown>;
      if (typeof methodOrFn === "function") {
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

  clearValidatorsBang(this: ValidationsClassHost): void {
    this.resetCallbacks("validate");
    this._validators = new Map();
  },

  validatorsOn(this: ValidationsClassHost, ...attributes: string[]): ValidatorLike[] {
    return attributes.flatMap((attribute) => this._validators.get(attribute) ?? []);
  },

  /** @internal */
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
  isAttributeMethod(this: { prototype: object }, attribute: string): boolean {
    const isWriter = attribute.endsWith("=");
    const accessor = inspectAccessor(this.prototype, isWriter ? attribute.slice(0, -1) : attribute);
    return isWriter ? accessor.hasSetter : accessor.hasGetter;
  },
};

export interface ModelWithErrors {
  errors: { fullMessages: string[] };
}

export class ValidationError<TModel extends ModelWithErrors = ModelWithErrors>
  extends globalThis.Error
{
  readonly model: TModel;

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

  get name(): string {
    const c = this._context;
    return Array.isArray(c) ? (c[0] ?? "") : (c ?? "");
  }

  toString(): string {
    return this.name;
  }
}

/** @internal */
const _predicatesForValidationContexts = new Map<
  string,
  (model: ValidationsContextHost) => boolean
>();

/** @internal */
export function initInternals<TBase extends object>(
  this: ValidationsInternalsHost<TBase>,
  super_: () => void,
): void {
  super_();
  this._contextForValidation = undefined;
}

interface ValidationsFreezeHost {
  readonly errors: unknown;
  /** @internal */
  contextForValidation(): unknown;
}

export const VALID_OPTIONS_FOR_VALIDATE = ["on", "if", "unless", "prepend", "exceptOn"] as const;

export interface ValidationsContextHost {
  readonly validationContext: string | string[] | null;
}

export const InstanceMethods = {
  freeze<T extends ValidationsFreezeHost>(this: T): T {
    void this.errors;
    void this.contextForValidation();
    Object.freeze(this);
    return this;
  },

  readAttributeForValidation(this: ReadAttributeForValidationHost, attribute: string): unknown {
    if (!(attribute in this)) {
      const klass = (this.constructor as { name?: string } | undefined)?.name ?? "object";
      throw new NoMethodError(`undefined method '${attribute}' for an instance of ${klass}`);
    }
    const reader = this[attribute];
    return typeof reader === "function" ? (reader as () => unknown).call(this) : reader;
  },

  /** @internal */
  contextForValidation(this: ContextForValidationHost): ValidationContext {
    if (this._contextForValidation) return this._contextForValidation;
    const vc = new ValidationContext();
    this._contextForValidation = vc;
    return vc;
  },

  /** @internal */
  async runValidationsBang(this: RunValidationsHost): Promise<boolean> {
    await this._runValidateCallbacks();
    return this.errors.empty;
  },

  raiseValidationError<TBase extends object = object>(this: { errors: Errors<TBase> }): never {
    throw new ValidationError(this);
  },
};

export interface ContextForValidationHost {
  _validationContext: string | string[] | null;
  _contextForValidation?: ValidationContext;
}

export interface RunValidationsHost<TBase extends object = object> {
  errors: Errors<TBase>;
  _runValidateCallbacks(): void | Promise<void>;
}

export interface ReadAttributeForValidationHost {
  [key: string]: unknown;
}

export function initializeDup<TBase extends object>(
  this: ValidationsInternalsHost<TBase>,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  this._errors = undefined;
  super_(other);
}

export function raiseOnMissingTranslations(value?: boolean): boolean {
  return translationRaise(value);
}

export type ConditionFn = ((record: ValidatableRecord) => boolean) | string;

/** @noRailsEquivalent PERMANENT */
export interface ConditionalOptions {
  if?: ConditionFn | ConditionFn[];
  unless?: ConditionFn | ConditionFn[];
  on?: string | string[];
  exceptOn?: string | string[];
  prepend?: boolean;
}
