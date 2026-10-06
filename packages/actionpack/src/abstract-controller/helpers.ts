import {
  camelize,
  classAttribute,
  constantize,
  extend,
  included,
  isAnonymous,
  NameError,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  isSymbol,
  Module,
  rbFSend,
  rbObjIsKindOf,
  rbObjRespondTo,
  symbolToS,
} from "@blazetrails/ruby-compat";

export type HelperMethodsModule = Module;

export interface HelpersClassMethods {
  _helpers?: HelperMethodsModule;
  _helperMethods?: string[];
  name?: string;
}

export interface HelpersClass extends HelpersClassMethods {
  _helperMethods: string[];
  name: string;
  helperMethod: typeof helperMethod;
  helper: typeof helper;
  clearHelpers: typeof clearHelpers;
  _helpersForModification: typeof _helpersForModification;
  defaultHelperModuleBang: typeof defaultHelperModuleBang;
  modulesForHelpers: (typeof Resolution)["modulesForHelpers"];
}

type HelperArgument = HelperMethodsModule | string | HelperArgument[];

export type HelperMethodNameList = string | HelperMethodNameList[];

export interface HelpersHost {
  constructor: HelpersClassMethods;
}

export function _helpersInstance(this: HelpersHost): HelperMethodsModule {
  return this.constructor._helpers ?? new Module();
}

export function _helpers(this: HelpersHost): HelperMethodsModule;
export function _helpers(cls: HelpersClassMethods): HelperMethodsModule;
export function _helpers(cls: HelpersClassMethods, value: HelperMethodsModule | null): void;
export function _helpers(
  this: HelpersHost | void,
  clsOrValue?: HelpersClassMethods,
  value?: HelperMethodsModule | null,
): HelperMethodsModule | void {
  if (clsOrValue && arguments.length >= 2) {
    if (value == null) {
      delete (clsOrValue as { _helpers?: HelperMethodsModule })._helpers;
    } else {
      clsOrValue._helpers = value;
    }
    return;
  }
  if (clsOrValue) {
    return clsOrValue._helpers ?? new Module();
  }
  return _helpersInstance.call(this as HelpersHost);
}

const helperMethodsByClass = new WeakMap<HelpersClassMethods, HelperMethodsModule>();

/** @internal */
export function defineHelpersModule(
  klass: HelpersClassMethods,
  helpers?: HelperMethodsModule | null,
): HelperMethodsModule {
  const existing = helperMethodsByClass.get(klass);
  if (existing) return existing;
  const mod = new Module();
  helperMethodsByClass.set(klass, mod);
  if (helpers) mod.include(helpers);
  return mod;
}

export const Resolution = {
  modulesForHelpers(modulesOrHelperPrefixes: readonly HelperArgument[]): HelperMethodsModule[] {
    return (modulesOrHelperPrefixes as readonly unknown[])
      .flat(Infinity)
      .map((moduleOrHelperPrefix) => {
        if (rbObjIsKindOf(moduleOrHelperPrefix, Module)) {
          return moduleOrHelperPrefix as HelperMethodsModule;
        } else if (typeof moduleOrHelperPrefix === "string") {
          let helperPrefix = isSymbol(moduleOrHelperPrefix)
            ? symbolToS(moduleOrHelperPrefix)
            : moduleOrHelperPrefix;
          if (!/^[A-Z]/.test(helperPrefix)) helperPrefix = camelize(helperPrefix);
          return constantize(`${helperPrefix}Helper`) as HelperMethodsModule;
        } else {
          throw new ArgumentError("helper must be a String, Symbol, or Module");
        }
      });
  },

  async allHelpersFromPath(path: string | readonly string[]): Promise<string[]> {
    const modName = ["@blazetrails", "activesupport", "glob"].join("/");
    const { glob } = (await import(modName)) as typeof import("@blazetrails/activesupport/glob");
    const helpers: string[] = [];
    for (const _path of typeof path === "string" ? [path] : path) {
      const names = (await glob("**/*{-,_}helper.{ts,js,rb}", { cwd: _path })).map((file) =>
        file.replace(/[-_]helper\.(ts|js|rb)$/, "").replaceAll("-", "_"),
      );
      helpers.push(...names.sort());
    }
    return [...new Set(helpers)];
  },

  async helperModulesFromPaths(
    this: {
      modulesForHelpers(modulesOrHelperPrefixes: readonly HelperArgument[]): HelperMethodsModule[];
      allHelpersFromPath(path: string | readonly string[]): Promise<string[]>;
    },
    paths: string | readonly string[],
  ): Promise<HelperMethodsModule[]> {
    return this.modulesForHelpers(await this.allHelpersFromPath(paths));
  },
};

/** @inventedArm if — PERMANENT */
export function helperMethod(this: HelpersClass, ...methods: HelperMethodNameList[]): void {
  const flat = (methods as readonly unknown[]).flat(Infinity) as string[];
  this._helperMethods = [...this._helperMethods, ...flat];

  for (const method of flat) {
    const attr = /^[A-Za-z_]\w*=$/.test(method) ? method.slice(0, -1) : method;
    const writer = this._helperMethods.includes(`${attr}=`);
    this._helpersForModification().moduleEval((mod) => {
      Object.defineProperty(mod, attr, {
        get(this: { controller: Record<string, unknown> }) {
          const controller = this.controller;
          if (attr in controller && typeof controller[attr] !== "function") {
            return rbFSend(controller, attr);
          }
          return (...args: unknown[]) => rbFSend(controller, attr, ...args);
        },
        set: writer
          ? function (this: { controller: Record<string, unknown> }, value: unknown) {
              const controller = this.controller;
              if (attr in controller && !rbObjRespondTo(controller, `${attr}=`)) {
                controller[attr] = value;
              } else {
                rbFSend(controller, `${attr}=`, value);
              }
            }
          : undefined,
        configurable: true,
      });
    });
  }
}

export function helper(
  this: HelpersClass,
  ...args: Array<HelperArgument | ((mod: Record<string, unknown>) => void)>
): void {
  const last = args.at(-1);
  const block =
    typeof last === "function" && !rbObjIsKindOf(last, Module)
      ? (args.pop() as (mod: Record<string, unknown>) => void)
      : null;
  for (const mod of this.modulesForHelpers(args as HelperArgument[])) {
    if (this._helpers!.isInclude(mod)) continue;
    this._helpersForModification().include(mod);
  }

  if (block) this._helpersForModification().moduleEval(block);
}

export function clearHelpers(this: HelpersClass): void {
  const inheritedHelperMethods = this._helperMethods;
  this._helpers = new Module();
  this._helperMethods = [];

  inheritedHelperMethods.forEach((meth) => this.helperMethod(meth));
  if (!isAnonymous(this)) this.defaultHelperModuleBang();
}

export function _helpersForModification(this: HelpersClass): HelperMethodsModule {
  if (!(Object.prototype.hasOwnProperty.call(this, "_helpers") && this._helpers)) {
    this._helpers = defineHelpersModule(
      this,
      (Object.getPrototypeOf(this) as HelpersClassMethods)._helpers,
    );
  }
  return this._helpers;
}

/** @internal */
export function defaultHelperModuleBang(this: HelpersClass): void {
  const helperPrefix = this.name.replace(/Controller$/, "");
  try {
    this.helper(helperPrefix);
  } catch (e) {
    if (!(e instanceof NameError)) throw e;
    if (!e.isMissingName(`${helperPrefix}Helper`)) throw e;
  }
}

export class Helpers {
  static ClassMethods = {
    ...Resolution,
    helperMethod,
    helper,
    clearHelpers,
    _helpersForModification,
    defaultHelperModuleBang,
  };

  static [included](base: HelpersClass): void {
    extend(base, Helpers.ClassMethods);
    classAttribute.call(base, "_helperMethods", { default: [] });
    base._helpers = defineHelpersModule(base);
  }
}

extend(Helpers, Resolution);
