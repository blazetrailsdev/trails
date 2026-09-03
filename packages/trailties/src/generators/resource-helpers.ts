import { camelize, pluralize, underscore } from "@blazetrails/activesupport";
import { ActiveModel } from "./active-model.js";
import { normalizeModelName, type ModelHelpersOptions, type SayFn } from "./model-helpers.js";

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
