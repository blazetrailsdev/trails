import { camelize, pluralize, underscore } from "@blazetrails/activesupport";
import { ActiveModel } from "./active-model.js";
import { normalizeModelName, type ModelHelpersOptions, type SayFn } from "./model-helpers.js";

// Mirrors railties/lib/rails/generators/resource_helpers.rb. `orm_class` /
// `orm_instance` (Ruby `constantize` lookup) are deferred to PR 1.14; the
// default fallback ActiveModel is re-exported via defaultOrmInstance().
export interface ResourceHelpersOptions extends ModelHelpersOptions {
  modelName?: string;
}

export interface ResourceHelpersInfo {
  name: string;
  controllerName: string;
  controllerClassPath: string[];
  controllerFileName: string;
}

export function applyResourceHelpers(
  rawName: string,
  options: ResourceHelpersOptions = {},
  say: SayFn = () => {},
): ResourceHelpersInfo {
  // Rails: super (ModelHelpers#initialize) normalizes once, then
  // `self.name = options[:model_name]` swaps without re-running the
  // pluralize-warn path; `assign_names!` only re-derives file/class paths.
  const initial = normalizeModelName(rawName, options, say);
  const name = options.modelName ?? initial;
  const controllerName = pluralize(initial);
  const parts = controllerName.includes("/")
    ? controllerName.split("/")
    : controllerName.split("::");
  const classPath = parts.map((p) => underscore(p));
  const fileName = classPath.pop()!;
  return { name, controllerName, controllerClassPath: classPath, controllerFileName: fileName };
}

export const controllerFilePath = (i: ResourceHelpersInfo): string =>
  [...i.controllerClassPath, i.controllerFileName].join("/");

export const controllerClassName = (i: ResourceHelpersInfo): string =>
  [...i.controllerClassPath, i.controllerFileName].map((s) => camelize(s)).join("::");

export const controllerI18nScope = (i: ResourceHelpersInfo): string =>
  controllerFilePath(i).replace(/\//g, ".");

export const defaultOrmInstance = (name: string): ActiveModel => new ActiveModel(name);
