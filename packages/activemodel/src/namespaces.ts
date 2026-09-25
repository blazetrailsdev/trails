import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import type { Error } from "./error.js";
import type {
  Errors,
  RangeError,
  StrictValidationFailed,
  UnknownAttributeError,
} from "./errors.js";
import type { JSON } from "./serializers/json.js";
import type { ValidationError } from "./validations.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "active_model/errors": () => import("./errors.js"),
  "active_model/error": () => import("./error.js"),
  "active_model/validations": () => import("./validations.js"),
  "active_model/serializers/json": () => import("./serializers/json.js"),
};

export const ActiveModel = { name: "ActiveModel", loadPath } as AutoloadModule & {
  Errors: typeof Errors;
  Error: typeof Error;
  RangeError: typeof RangeError;
  StrictValidationFailed: typeof StrictValidationFailed;
  UnknownAttributeError: typeof UnknownAttributeError;
  ValidationError: typeof ValidationError;
  Serializers: typeof Serializers;
};
extend(ActiveModel, Autoload);
ActiveModel.eagerAutoload(() => {
  ActiveModel.autoload("Errors");
  ActiveModel.autoload("Error");
  ActiveModel.autoload("RangeError", "active_model/errors");
  ActiveModel.autoload("StrictValidationFailed", "active_model/errors");
  ActiveModel.autoload("UnknownAttributeError", "active_model/errors");
  ActiveModel.autoload("ValidationError", "active_model/validations");
});

export const Serializers = { name: "ActiveModel::Serializers", loadPath } as AutoloadModule & {
  JSON: typeof JSON;
};
extend(Serializers, Autoload);
Serializers.eagerAutoload(() => {
  Serializers.autoload("JSON");
});
ActiveModel.Serializers = Serializers;

Object.defineProperty(ActiveModel, "eagerLoadBang", {
  value: async function eagerLoadBang(this: typeof ActiveModel): Promise<void> {
    await Autoload.eagerLoadBang.call(this);
    await Serializers.eagerLoadBang();
  },
  writable: true,
  configurable: true,
});
