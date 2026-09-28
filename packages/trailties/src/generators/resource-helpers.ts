import {
  NameError,
  camelize,
  constantize,
  pluralize,
  underscore,
} from "@blazetrails/activesupport";
import { include, included, initialize } from "@blazetrails/ruby-compat";
import { ActiveModel } from "./active-model.js";
import { ModelHelpers } from "./model-helpers.js";
import type { GeneratorBase } from "./base.js";
import type { NamedBase } from "./named-base.js";

export interface ResourceHelpersHost extends NamedBase {
  options: NamedBase["options"] & { modelName?: string; orm?: unknown };
  controllerName: string;
  controllerFileName: string;
  _controllerClassPath: string[];
  _controllerFilePath?: string;
  _controllerI18nScope?: string;
  _ormClass?: typeof ActiveModel;
  _ormInstance?: ActiveModel;
  controllerClassPath(): string[];
  assignControllerNamesBang(name: string): void;
  controllerFilePath(): string;
  ormClass(): typeof ActiveModel;
  ormInstance(name?: string): ActiveModel;
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

/** @internal */
function ormClass(this: ResourceHelpersHost): typeof ActiveModel {
  return (this._ormClass ??= (() => {
    if (!(this.constructor as typeof GeneratorBase).classOptions()["orm"]) {
      throw new Error("You need to have :orm as class option to invoke orm_class and orm_instance");
    }

    try {
      return constantize(
        `${camelize(String(this.options.orm ?? ""))}::Generators::ActiveModel`,
      ) as typeof ActiveModel;
    } catch (e) {
      if (!(e instanceof NameError)) throw e;
      return ActiveModel;
    }
  })());
}

/** @internal */
function ormInstance(
  this: ResourceHelpersHost,
  name: string = this.singularTableName(),
): ActiveModel {
  return (this._ormInstance ??= new (this.ormClass())(name));
}

export const ResourceHelpers = {
  controllerClassPath,
  assignControllerNamesBang,
  controllerFilePath,
  controllerClassName,
  controllerI18nScope,
  ormClass,
  ormInstance,

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
