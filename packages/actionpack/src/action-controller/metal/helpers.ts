import { extend, type InheritableOptions } from "@blazetrails/activesupport";
import { Base as ActionViewBase } from "@blazetrails/actionview";
import { registerConstant } from "@blazetrails/ruby-compat";
import {
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

export interface HelperProxyClass {
  _helperProxy?: ActionViewBase;
  _helpers?: HelperMethodsModule;
}

type ConfigReceiver = { config(): InheritableOptions };

export const ClassMethods = {
  helpers(this: HelperProxyClass): ActionViewBase {
    if (!Object.hasOwn(this, "_helperProxy") || this._helperProxy == null) {
      const proxy = ActionViewBase.empty();
      proxy.config = (this as unknown as ConfigReceiver).config().inheritableCopy();
      extend(proxy, this._helpers!);
      this._helperProxy = proxy;
    }
    return this._helperProxy;
  },
};

/** @internal */
function allApplicationHelpers(): string[] {
  return _applicationHelpers;
}

export function modulesForHelpers(
  args: ReadonlyArray<HelperMethodsModule | string | Array<unknown>>,
): HelperMethodsModule[] {
  const rest = args.filter((arg) => arg !== ":all");
  const argsWithAll = rest.length === args.length ? rest : [...rest, ...allApplicationHelpers()];
  return Resolution.modulesForHelpers(argsWithAll as Array<HelperMethodsModule | string>);
}

export function helpers(this: {
  _helperProxy?: ActionViewBase | null;
  viewContext(): ActionViewBase;
}): ActionViewBase {
  return (this._helperProxy ??= this.viewContext());
}
