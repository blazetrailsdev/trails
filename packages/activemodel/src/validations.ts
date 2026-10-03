import {
  classAttribute,
  extend,
  extractOptionsBang,
  include,
  included,
  kernelArray,
} from "@blazetrails/activesupport";

import {
  block as rbBlock,
  Module,
  rbBlockGivenP,
  rbFPublicSend,
  rbModConstSet,
  rbModMethodDefined,
} from "@blazetrails/ruby-compat";

import { Errors } from "./errors.js";
import { BlockValidator, EachValidator, Validator } from "./validator.js";
import type { ValidatableRecord } from "./validator.js";
import { I18n } from "./i18n.js";

import { Naming } from "./naming.js";
import { Translation } from "./translation.js";
import { HelperMethods } from "./validations/helper-methods.js";
import {
  ClassMethods as WithClassMethods,
  validatesWith as withValidatesWith,
} from "./validations/with.js";
import * as Validates from "./validations/validates.js";
import { AbsenceValidator } from "./validations/absence.js";
import { AcceptanceValidator } from "./validations/acceptance.js";
import { ComparisonValidator } from "./validations/comparison.js";
import { ConfirmationValidator } from "./validations/confirmation.js";
import { ExclusionValidator } from "./validations/exclusion.js";
import { FormatValidator } from "./validations/format.js";
import { InclusionValidator } from "./validations/inclusion.js";
import { LengthValidator } from "./validations/length.js";
import { NumericalityValidator } from "./validations/numericality.js";
import { PresenceValidator } from "./validations/presence.js";
import { WithValidator } from "./validations/with.js";
import { ArgumentError, NoMethodError } from "./attribute-assignment.js";
import type { CallbackConditions } from "./callbacks.js";
import {
  Callbacks,
  _defineBeforeModelCallback as _defineBeforeModelCallbackImpl,
  _defineAroundModelCallback as _defineAroundModelCallbackImpl,
  _defineAfterModelCallback as _defineAfterModelCallbackImpl,
} from "./callbacks.js";
import { ActiveModel } from "./namespaces.js";

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
    include(base, SuperMethods);
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
    (base as IncludingClass & ValidationsClassHost).defineCallbacks("validate", {
      scope: ["name"],
    });
    classAttribute.call(base, "_validators", { instanceWriter: false, default: new Map() });
  }

  /** @internal */
  declare _errors?: Errors<this>;

  /** @internal */
  declare _contextForValidation?: ValidationContext;

  get errors(): Errors<this> {
    return (this._errors ??= new Errors(this));
  }

  async isValid(context: string | string[] | null = null): Promise<boolean> {
    const currentContext = this.validationContext;
    this.contextForValidation().context = context;
    this.errors.clear();

    try {
      return await this.runValidationsBang();
    } finally {
      this.contextForValidation().context = currentContext;
    }
  }

  declare validate: (context?: string | string[] | null) => Promise<boolean>;

  declare freeze: () => this;

  async isInvalid(context: string | string[] | null = null): Promise<boolean> {
    return !(await this.isValid(context));
  }

  async validateBang(context: string | string[] | null = null): Promise<true> {
    return (await this.isValid(context)) || this.raiseValidationError();
  }

  readAttributeForValidation(this: ReadAttributeForValidationHost, attribute: string): unknown {
    if (!(attribute in this)) {
      const klass = (this.constructor as { name?: string } | undefined)?.name ?? "object";
      throw new NoMethodError(`undefined method '${attribute}' for an instance of ${klass}`);
    }
    const reader = this[attribute];
    return typeof reader === "function" ? (reader as () => unknown).call(this) : reader;
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
  declare _runValidateCallbacks: (block?: () => unknown) => unknown;

  /** @internal */
  contextForValidation(): ValidationContext {
    return (this._contextForValidation ??= new ValidationContext());
  }

  /** @internal */
  async runValidationsBang(): Promise<boolean> {
    await this._runValidateCallbacks();
    return this.errors.isEmpty();
  }

  raiseValidationError(): never {
    throw new ValidationError(this);
  }
}

Validations.prototype.validate = Validations.prototype.isValid;

type ValidatorLike = Validator | EachValidator | { validate(record: ValidatableRecord): unknown };

type ValidateFilter<T extends ValidatableRecord> =
  | string
  | ((record: T) => unknown)
  | ValidatorLike;

export type ValidateArgs<T extends ValidatableRecord = ValidatableRecord> =
  | [
      ...filters: Array<ValidateFilter<T>>,
      options: ConditionalOptions,
      block: (record: T) => unknown,
    ]
  | [...filters: Array<ValidateFilter<T>>, options: ConditionalOptions]
  | Array<ValidateFilter<T>>;

export interface ValidationsClassHost {
  _validators: Map<string | null, ValidatorLike[]>;
  _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  validatesWith(...args: unknown[]): void;
  validate(...args: ValidateArgs<ValidatableRecord>): void;
  setCallback(
    name: string,
    ...filterList: Array<string | ((record: object) => unknown) | CallbackConditions>
  ): void;
  resetCallbacks(name: string): void;
  defineCallbacks(name: string, options?: { scope?: string[] }): void;
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
    this.validatesWith(
      BlockValidator,
      this._mergeAttributes([...attrNames, options]),
      rbBlock(block),
    );
  },

  validate<T extends ValidatableRecord = ValidatableRecord>(
    this: ValidationsClassHost,
    ...args: ValidateArgs<T>
  ): void {
    const filters = args as unknown[];
    const block = rbBlockGivenP(filters[filters.length - 1]) ? filters.pop() : undefined;
    const extracted = extractOptionsBang(filters);
    let options = extracted as ConditionalOptions;

    if (filters.every((arg) => typeof arg === "string" && arg.startsWith(":"))) {
      for (const k of Object.keys(options)) {
        if (!(VALID_OPTIONS_FOR_VALIDATE as readonly string[]).includes(k)) {
          throw new ArgumentError(
            `Unknown key: :${k}. Valid keys are: ${VALID_OPTIONS_FOR_VALIDATE.map((v) => `:${v}`).join(", ")}. Perhaps you meant to call \`validates\` instead of \`validate\`?`,
          );
        }
      }
    }

    if (options.on !== undefined) {
      const pred = this.predicateForValidationContext(options.on);
      options = {
        ...options,
        if: [
          (record: object) => pred(record as ValidationsContextHost),
          ...kernelArray(options.if as CallbackConditions["if"]),
        ] as ConditionalOptions["if"],
      };
    }

    if (options.exceptOn !== undefined) {
      const exceptOn = kernelArray(options.exceptOn);
      options = {
        ...options,
        exceptOn,
        unless: [
          (record: object) => {
            const current = kernelArray(
              (record as unknown as ValidationsContextHost).validationContext,
            );
            return exceptOn.some((c) => current.includes(c));
          },
          ...kernelArray(options.unless as CallbackConditions["unless"]),
        ] as ConditionalOptions["unless"],
      };
    }

    this.setCallback(
      "validate",
      ...(filters as Array<string | ((record: object) => unknown)>),
      options as CallbackConditions,
      ...(block !== undefined ? [block as (record: object) => unknown] : []),
    );
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
    return rbModMethodDefined(this, attribute);
  },
};

export interface ModelWithErrors {
  errors: { fullMessages: (string | null)[] };
}

export class ValidationError<TModel extends ModelWithErrors = ModelWithErrors>
  extends globalThis.Error
{
  readonly model: TModel;

  constructor(model: TModel) {
    const errors = model.errors.fullMessages.join(", ");
    const message = I18n.t(
      `${rbFPublicSend(model.constructor, "i18nScope")}.errors.messages.model_invalid`,
      {
        errors,
        default: ":errors.messages.model_invalid",
      },
    ) as string;
    super(message);
    this.name = "ValidationError";
    this.model = model;
  }
}

export class ValidationContext {
  context: string | string[] | null = null;
}

/** @internal */
const _predicatesForValidationContexts = new Map<
  string,
  (model: ValidationsContextHost) => boolean
>();

export function initializeDup<TBase extends object>(
  this: ValidationsInternalsHost<TBase>,
  other: unknown,
): void {
  this._errors = undefined;
  SuperMethods.superMethod(this, "initializeDup")!(other);
}

export function freeze<T extends Validations>(this: T): T {
  void this.errors;
  void this.contextForValidation();

  return SuperMethods.superMethod(this, "freeze")!() as T;
}

export const VALID_OPTIONS_FOR_VALIDATE = ["on", "if", "unless", "prepend", "exceptOn"] as const;

export interface ValidationsContextHost {
  readonly validationContext: string | string[] | null;
}

export interface ReadAttributeForValidationHost {
  [key: string]: unknown;
}

/** @internal */
export function initInternals<TBase extends object>(this: ValidationsInternalsHost<TBase>): void {
  SuperMethods.superMethod(this, "initInternals")!();
  this._errors = undefined;
  this._contextForValidation = undefined;
}

const SuperMethods = new Module((mod) => {
  mod.defineMethod("freeze", freeze);
  mod.defineMethod("initializeDup", initializeDup);
  mod.defineMethod("initInternals", initInternals);
});

export type ConditionFn = ((record: ValidatableRecord) => boolean) | string;

export interface ConditionalOptions {
  if?: ConditionFn | ConditionFn[];
  unless?: ConditionFn | ConditionFn[];
  on?: string | string[];
  exceptOn?: string | string[];
  prepend?: boolean;
}

ActiveModel.ValidationError = ValidationError;
rbModConstSet(ActiveModel, "Validations", Validations);
rbModConstSet(Validations, "AbsenceValidator", AbsenceValidator);
rbModConstSet(Validations, "AcceptanceValidator", AcceptanceValidator);
rbModConstSet(Validations, "ComparisonValidator", ComparisonValidator);
rbModConstSet(Validations, "ConfirmationValidator", ConfirmationValidator);
rbModConstSet(Validations, "ExclusionValidator", ExclusionValidator);
rbModConstSet(Validations, "FormatValidator", FormatValidator);
rbModConstSet(Validations, "InclusionValidator", InclusionValidator);
rbModConstSet(Validations, "LengthValidator", LengthValidator);
rbModConstSet(Validations, "NumericalityValidator", NumericalityValidator);
rbModConstSet(Validations, "PresenceValidator", PresenceValidator);
rbModConstSet(Validations, "WithValidator", WithValidator);
