import { ActionController } from "../../namespaces.js";
import { rbCallSuper, rbModConstSet } from "@blazetrails/ruby-compat";
import {
  classAttribute,
  Concern,
  extend,
  include,
  type InheritableOptions,
} from "@blazetrails/activesupport";
import { Base as ActionViewBase } from "@blazetrails/actionview";
import { aryDelete, rbObjIvarGet, rbObjIvarSet } from "@blazetrails/ruby-compat";
import {
  Helpers as AbstractHelpers,
  Resolution,
  type HelperMethodNameList,
  type HelperMethodsModule,
  type HelpersClass,
} from "../../abstract-controller/helpers.js";

let _helpersPath: string[] = [];

export function helpersPath(): string[] {
  return _helpersPath;
}

export function setHelpersPath(paths: string[]): void {
  _helpersPath = paths;
}

export function helperAttr(this: HelpersClass, ...attrs: HelperMethodNameList[]): void {
  ((attrs as readonly unknown[]).flat(Infinity) as string[]).forEach((attr) =>
    this.helperMethod(attr, `${attr}=`),
  );
}

type ConfigReceiver = { config(): InheritableOptions };

type HelpersClassHost = HelpersClass & {
  helpersPath: string | string[];
  allHelpersFromPath: (typeof Resolution)["allHelpersFromPath"];
  allApplicationHelpers(): string[];
};

export function modulesForHelpers(
  this: HelpersClassHost,
  args: Array<HelperMethodsModule | string | Array<unknown>>,
): HelperMethodsModule[] {
  if (aryDelete(args, ":all") != null) {
    args = [...args, ...this.allApplicationHelpers()];
  }
  return rbCallSuper(this, modulesForHelpers, args) as HelperMethodsModule[];
}

/** @internal */
function allApplicationHelpers(this: HelpersClassHost): string[] {
  return this.allHelpersFromPath(this.helpersPath);
}

export const ClassMethods = {
  helperAttr,

  helpers(this: HelpersClass): ActionViewBase {
    return ((rbObjIvarGet(this, "@helper_proxy") as ActionViewBase | null) ||
      rbObjIvarSet(
        this,
        "@helper_proxy",
        (() => {
          const proxy = ActionViewBase.empty();
          proxy.config = (this as unknown as ConfigReceiver).config().inheritableCopy();
          return extend(proxy, this._helpers);
        })(),
      )) as ActionViewBase;
  },

  modulesForHelpers,
  allApplicationHelpers,
};

export function helpers(this: {
  _helperProxy?: ActionViewBase | null;
  viewContext(): ActionViewBase;
}): ActionViewBase {
  return (this._helperProxy ??= this.viewContext());
}

export const Helpers = { ClassMethods, helpers };
extend(Helpers, Concern);
include(Helpers, AbstractHelpers);
Concern.included.call(Helpers as never, null, function (this: object) {
  classAttribute.call(this, "helpersPath", { default: [] });
  classAttribute.call(this, "includeAllHelpers", { default: true });
});

rbModConstSet(ActionController, "Helpers", Helpers);
