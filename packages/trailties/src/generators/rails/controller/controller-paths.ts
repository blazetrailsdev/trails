import { dasherize } from "../../base.js";
import { camelize, underscore } from "@blazetrails/activesupport";

export interface ControllerPaths {
  className: string;
  displayName: string;
  controllerFile: string;
  viewBase: string;
  helperName: string;
  helperFile: string;
  namespaceParts: string[];
}

export function controllerPathHelpers(name: string): ControllerPaths {
  const stripped = name.replace(/[_-]?[Cc]ontroller$/, "");
  const parts = stripped.split("/");
  const className =
    parts.length > 1
      ? parts.map((p) => camelize(underscore(p))).join("") + "Controller"
      : camelize(underscore(stripped)) + "Controller";
  const displayName =
    parts.length > 1
      ? parts.map((p) => camelize(underscore(p))).join("::") + "Controller"
      : camelize(underscore(stripped)) + "Controller";
  const controllerFile =
    parts.length > 1
      ? parts.map((p) => dasherize(underscore(p))).join("/") + "-controller"
      : dasherize(underscore(stripped)) + "-controller";
  const viewBase =
    parts.length > 1
      ? parts.map((p) => dasherize(underscore(p))).join("/")
      : dasherize(underscore(stripped));
  const leaf = parts[parts.length - 1];
  const helperName = camelize(underscore(leaf)) + "Helper";
  const helperFile = dasherize(underscore(leaf)) + "-helper";
  return {
    className,
    displayName,
    controllerFile,
    viewBase,
    helperName,
    helperFile,
    namespaceParts: parts,
  };
}
