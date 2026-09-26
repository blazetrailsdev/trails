import {
  camelize,
  include,
  included,
  initialize,
  pluralize,
  underscore,
} from "@blazetrails/activesupport";
import { ModelHelpers } from "./model-helpers.js";
import type { GeneratorBase } from "./base.js";
import type { NamedBase } from "./named-base.js";

export interface ResourceHelpersHost extends NamedBase {
  options: NamedBase["options"] & { modelName?: string };
  controllerName: string;
  controllerFileName: string;
  _controllerClassPath: string[];
  _controllerFilePath?: string;
  _controllerI18nScope?: string;
  controllerClassPath(): string[];
  assignControllerNamesBang(name: string): void;
  controllerFilePath(): string;
}

/** @internal */
function controllerClassPath(this: ResourceHelpersHost): string[] {
  if (this.options.modelName != null) {
    return this._controllerClassPath;
  } else {
    return this.classPathParts;
  }
}

/** @internal */
function assignControllerNamesBang(this: ResourceHelpersHost, name: string): void {
  this.controllerName = name;
  this._controllerClassPath = name.includes("/") ? name.split("/") : name.split("::");
  this._controllerClassPath = this._controllerClassPath.map((p) => underscore(p));
  this.controllerFileName = this._controllerClassPath.pop()!;
}

/** @internal */
function controllerFilePath(this: ResourceHelpersHost): string {
  return (this._controllerFilePath ??= [
    ...this.controllerClassPath(),
    this.controllerFileName,
  ].join("/"));
}

/** @internal */
function controllerClassName(this: ResourceHelpersHost): string {
  return [...this.controllerClassPath(), this.controllerFileName]
    .map((s) => camelize(s))
    .join("::");
}

/** @internal */
function controllerI18nScope(this: ResourceHelpersHost): string {
  return (this._controllerI18nScope ??= this.controllerFilePath().replace(/\//g, "."));
}

export const ResourceHelpers = {
  controllerClassPath,
  assignControllerNamesBang,
  controllerFilePath,
  controllerClassName,
  controllerI18nScope,

  [included](base: unknown): void {
    const klass = base as typeof GeneratorBase & (new (...args: never[]) => GeneratorBase);
    include(klass, ModelHelpers);
    klass.classOption("modelName", { type: "string", desc: "ModelName to be used" });
  },

  [initialize](this: ResourceHelpersHost): void {
    const controllerName = this.name;
    if (this.options.modelName != null) {
      this.name = this.options.modelName;
      this.assignNamesBang(this.name);
    }

    this.assignControllerNamesBang(pluralize(controllerName));
  },
};
