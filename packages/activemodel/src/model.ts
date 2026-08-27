import { Errors } from "./errors.js";
import {
  ValidationContext,
  ClassMethods as ValidationsClassMethods,
  initInternals as validationsInitInternals,
  initializeDup as validationsInitializeDup,
} from "./validations.js";
import { HelperMethods } from "./validations/helper-methods.js";
import {
  Callbacks as ASCallbacks,
  defineCallbacks,
  runCallbacks,
  extend,
  include,
  prepend,
  runLoadHooks,
  ToJsonWithActiveSupportEncoder,
  type Included,
  type Extended,
} from "@blazetrails/activesupport";
import { humanAttributeName as translationHumanAttributeName } from "./translation.js";
import { ModelName } from "./naming.js";
import { defineModelCallbacks as defineModelCallbacksImpl } from "./callbacks.js";
import { EachValidator, Validator as ValidatorBase } from "./validator.js";
import type { ValidatableRecord } from "./validator.js";
import type { ConditionalOptions } from "./validations.js";
import {
  ClassMethods as ValidationsCallbacksClassMethods,
  type ValidationCallbackFilter,
  type ValidationCallbackOptions,
} from "./validations/callbacks.js";
import * as Validates from "./validations/validates.js";
import { ClassMethods as WithClassMethods } from "./validations/with.js";
import type { ClassMethods as ConversionClassMethods } from "./conversion.js";
import { Access } from "./access.js";
import { Naming } from "./naming.js";
import { API, initialize as apiInitialize } from "./api.js";

type ValidatorLike = ValidatorBase | EachValidator | { validate(record: ValidatableRecord): void };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface Model extends API, Access, Naming {
  freeze(): this;

  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];

  /** @internal */
  initInternals(): void;
  /** @internal */
  initializeDup(other: unknown): void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Model {
  [key: string]: unknown;

  declare static paramDelimiter: string;
  declare private static _modelName: ModelName | null;
  declare static _validators: Map<string | null, Array<ValidatorLike>>;

  declare static _toPartialPath: Extended<typeof ConversionClassMethods>["_toPartialPath"];

  declare static validates: Extended<typeof Validates>["validates"];

  declare static validatesBang: Extended<typeof Validates>["validatesBang"];

  declare static clearValidatorsBang: Extended<
    typeof ValidationsClassMethods
  >["clearValidatorsBang"];

  static isAttributeMethod(attribute: string): boolean {
    return attribute in this.prototype;
  }

  declare static validate: <T extends ValidatableRecord = ValidatableRecord>(
    methodOrFn: string | ((record: T) => unknown),
    options?: ConditionalOptions,
  ) => void;

  declare static validatesEach: <T extends ValidatableRecord = ValidatableRecord>(
    attrNames: Array<string | string[]>,
    block: (record: T, attribute: string, value: unknown) => void,
    options?: ConditionalOptions,
  ) => void;

  declare static validatesWith: Extended<typeof WithClassMethods>["validatesWith"];

  declare static validators: Extended<typeof ValidationsClassMethods>["validators"];

  declare static validatorsOn: Extended<typeof ValidationsClassMethods>["validatorsOn"];

  declare static validatesPresenceOf: Extended<typeof HelperMethods>["validatesPresenceOf"];
  declare static validatesAbsenceOf: Extended<typeof HelperMethods>["validatesAbsenceOf"];
  declare static validatesLengthOf: Extended<typeof HelperMethods>["validatesLengthOf"];
  declare static validatesSizeOf: Extended<typeof HelperMethods>["validatesSizeOf"];
  declare static validatesNumericalityOf: Extended<typeof HelperMethods>["validatesNumericalityOf"];
  declare static validatesInclusionOf: Extended<typeof HelperMethods>["validatesInclusionOf"];
  declare static validatesExclusionOf: Extended<typeof HelperMethods>["validatesExclusionOf"];
  declare static validatesFormatOf: Extended<typeof HelperMethods>["validatesFormatOf"];
  declare static validatesAcceptanceOf: Extended<typeof HelperMethods>["validatesAcceptanceOf"];
  declare static validatesConfirmationOf: Extended<typeof HelperMethods>["validatesConfirmationOf"];
  declare static validatesComparisonOf: Extended<typeof HelperMethods>["validatesComparisonOf"];

  /** @internal */
  declare static _mergeAttributes: Extended<typeof HelperMethods>["_mergeAttributes"];

  declare static beforeValidation: <T extends typeof Model>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options?: ValidationCallbackOptions,
  ) => void;
  declare static afterValidation: <T extends typeof Model>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options?: ValidationCallbackOptions,
  ) => void;

  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare static skipCallback: Extended<typeof ASCallbacks.ClassMethods>["skipCallback"];
  declare static resetCallbacks: Extended<typeof ASCallbacks.ClassMethods>["resetCallbacks"];

  declare static defineModelCallbacks: typeof defineModelCallbacksImpl;

  declare static humanAttributeName: typeof translationHumanAttributeName;

  declare static i18nScope: string;

  declare static lookupAncestors: () => Array<{
    new (...args: never[]): unknown;
    modelName: ModelName;
  }>;

  /** @noRailsEquivalent PERMANENT */
  declare static moduleName?: string;

  declare static modelName: ModelName;

  errors!: Errors<this>;

  /** @internal */
  _initializingAttributes = false;

  /** @internal */
  declare static predicateForValidationContext: Extended<
    typeof ValidationsClassMethods
  >["predicateForValidationContext"];

  /** @internal */
  declare static _validatesDefaultKeys: Extended<typeof Validates>["_validatesDefaultKeys"];

  /** @internal */
  declare static _parseValidatesOptions: Extended<typeof Validates>["_parseValidatesOptions"];

  constructor(attrs: Record<string, unknown> = {}) {
    const ctor = this.constructor as typeof Model;

    this.initInternals();

    this._initializingAttributes = true;
    try {
      apiInitialize.call(this, attrs);
    } finally {
      this._initializingAttributes = false;
    }

    const callbackSuppressor = ctor as typeof ctor & { _suppressInitializeCallback?: boolean };
    if (callbackSuppressor._suppressInitializeCallback !== true) {
      void runCallbacks(this, "initialize", undefined, { strict: "sync" });
    }
  }

  /** @internal */
  _contextForValidation?: ValidationContext;

  dup(): this {
    const duped = Object.create(Object.getPrototypeOf(this) as object) as this;
    const descriptors = Object.getOwnPropertyDescriptors(this);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key as string];
      descriptor.configurable = true;
      if (!descriptor.get && !descriptor.set) descriptor.writable = true;
    }
    Object.defineProperties(duped, descriptors);
    duped.initializeDup(this);
    return duped;
  }

  declare runCallbacks: Included<typeof ASCallbacks.InstanceMethods>["runCallbacks"];
}

extend(Model, ValidationsCallbacksClassMethods);

include(Model, API);

defineCallbacks(Model.prototype, "validation", {
  skipAfterCallbacksIfTerminated: true,
  scope: ["kind", "name"],
});

include(Model, ToJsonWithActiveSupportEncoder);

include(Model, Access);

prepend(Model.prototype, {
  initInternals: validationsInitInternals,
  initializeDup: validationsInitializeDup,
});

runLoadHooks("active_model", Model);
