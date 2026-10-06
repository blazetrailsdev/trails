import {
  classAttribute,
  Concern,
  extend,
  include,
  Module,
  type InheritableOptions,
} from "@blazetrails/activesupport";
import { Base as ActionViewBase } from "@blazetrails/actionview";
import { aryDelete, rbObjIvarGet, rbObjIvarSet, registerConstant } from "@blazetrails/ruby-compat";
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

let _applicationHelpers: string[] = [];

/** @noRailsEquivalent PERMANENT */
export function setApplicationHelpers(
  names: string[],
  constants: Map<string, HelperMethodsModule>,
): void {
  _applicationHelpers = names;
  for (const [name, mod] of constants) registerConstant(name, mod);
}

/** @noRailsEquivalent PERMANENT */
export async function loadApplicationHelperNames(): Promise<string[]> {
  _applicationHelpers = await Resolution.allHelpersFromPath(_helpersPath);
  return _applicationHelpers;
}

export function helperAttr(this: HelpersClass, ...attrs: HelperMethodNameList[]): void {
  ((attrs as readonly unknown[]).flat(Infinity) as string[]).forEach((attr) =>
    this.helperMethod(attr, `${attr}=`),
  );
}

type ConfigReceiver = { config(): InheritableOptions };

type HelpersClassHost = HelpersClass & { allApplicationHelpers(): string[] };

export function modulesForHelpers(
  this: HelpersClassHost,
  args: Array<HelperMethodsModule | string | Array<unknown>>,
): HelperMethodsModule[] {
  if (aryDelete(args, ":all") != null) {
    args = [...args, ...this.allApplicationHelpers()];
  }
  return ClassMethods.superMethod(this, "modulesForHelpers")!(args) as HelperMethodsModule[];
}

/**
 * @internal
 * @missingRailsCall all_helpers_from_path — CONVERGEABLE action-controller-helpers-all-application-helpers-and-helper-method-accessor-arm
 * @missingRailsCall helpers_path — CONVERGEABLE action-controller-helpers-all-application-helpers-and-helper-method-accessor-arm
 */
function allApplicationHelpers(): string[] {
  return _applicationHelpers;
}

export const ClassMethods: Module = new Module((mod) => {
  mod.defineMethod("helperAttr", helperAttr);

  mod.defineMethod("helpers", function (this: HelpersClass): ActionViewBase {
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
  });

  mod.defineMethod("modulesForHelpers", modulesForHelpers);
  mod.defineMethod("allApplicationHelpers", allApplicationHelpers);
});

export function helpers(this: {
  _helperProxy?: ActionViewBase | null;
  viewContext(): ActionViewBase;
}): ActionViewBase {
  return (this._helperProxy ??= this.viewContext());
}

export const Helpers = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function (this: object) {
      include(this as HelpersClass, AbstractHelpers);
      classAttribute.call(this, "helpersPath", { default: [] });
      classAttribute.call(this, "includeAllHelpers", { default: true });
    },
  );

  mod.defineMethod("helpers", helpers);
}) as Module<{ helpers: typeof helpers }> & { ClassMethods: typeof ClassMethods };
Helpers.ClassMethods = ClassMethods;
