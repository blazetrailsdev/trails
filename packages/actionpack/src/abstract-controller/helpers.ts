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
  rbObjIsKindOf,
  symbolToS,
} from "@blazetrails/ruby-compat";

/** @internal */

export type HelperMethodsModule = Record<string, (...args: unknown[]) => unknown>;

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

const includedHelperModules = new WeakMap<HelperMethodsModule, WeakSet<object>>();

export interface HelpersHost {
  constructor: HelpersClassMethods;
}

export function _helpersInstance(this: HelpersHost): HelperMethodsModule {
  return this.constructor._helpers ?? (Object.create(null) as HelperMethodsModule);
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
    return clsOrValue._helpers ?? (Object.create(null) as HelperMethodsModule);
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
  const mod = Object.create(helpers ?? null) as HelperMethodsModule;
  helperMethodsByClass.set(klass, mod);
  return mod;
}

/** @internal */
function isModuleObject(value: unknown): value is HelperMethodsModule {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

export const Resolution = {
  modulesForHelpers(modulesOrHelperPrefixes: readonly HelperArgument[]): HelperMethodsModule[] {
    return (modulesOrHelperPrefixes as readonly unknown[])
      .flat(Infinity)
      .map((moduleOrHelperPrefix) => {
        if (rbObjIsKindOf(moduleOrHelperPrefix, Module) || isModuleObject(moduleOrHelperPrefix)) {
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
        file.replace(/[-_]helper\.(ts|js|rb)$/, ""),
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

export function helperMethod(this: HelpersClass, ...methods: HelperMethodNameList[]): void {
  const flat = (methods as readonly unknown[]).flat(Infinity) as string[];
  this._helperMethods = [...this._helperMethods, ...flat];

  for (const method of flat) {
    const mod = this._helpersForModification();
    let proto = (this as { prototype?: object }).prototype ?? null;
    let descriptor: PropertyDescriptor | undefined;
    while (proto && !(descriptor = Object.getOwnPropertyDescriptor(proto, method))) {
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    if (descriptor?.get) {
      Object.defineProperty(mod, method, {
        get(this: { controller: Record<string, unknown> }) {
          return this.controller[method];
        },
        configurable: true,
        enumerable: true,
      });
      continue;
    }
    mod[method] = function (this: { controller: Record<string, unknown> }, ...args: unknown[]) {
      const fn = this.controller[method];
      if (typeof fn !== "function") {
        throw new TypeError(`helper_method: controller does not respond to '${method}'`);
      }
      return (fn as (...a: unknown[]) => unknown).apply(this.controller, args);
    };
  }
}

export function helper(
  this: HelpersClass,
  ...args: Array<HelperArgument | ((mod: HelperMethodsModule) => void)>
): void {
  const last = args.at(-1);
  const block =
    typeof last === "function" && !rbObjIsKindOf(last, Module)
      ? (args.pop() as (mod: HelperMethodsModule) => void)
      : null;
  for (const mod of this.modulesForHelpers(args as HelperArgument[])) {
    if (isHelperIncluded(this._helpers, mod)) continue;
    const head = this._helpersForModification();
    Object.setPrototypeOf(head, makeIncludeLink(mod, Object.getPrototypeOf(head) as object | null));
    recordHelperIncluded(head, mod);
  }

  if (block) block(this._helpersForModification());
}

function isHelperIncluded(helpers: HelperMethodsModule | undefined, mod: object): boolean {
  let current: object | null = helpers ?? null;
  while (current) {
    if (includedHelperModules.get(current as HelperMethodsModule)?.has(mod)) {
      return true;
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function makeIncludeLink(
  mod: HelperMethodsModule,
  currentTail: object | null,
): HelperMethodsModule {
  const target = Object.create(currentTail) as HelperMethodsModule;
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (Object.prototype.hasOwnProperty.call(mod, prop)) {
        return (mod as Record<PropertyKey, unknown>)[prop as PropertyKey];
      }
      return Reflect.get(t, prop, receiver);
    },
    has(t, prop) {
      return Object.prototype.hasOwnProperty.call(mod, prop) || Reflect.has(t, prop);
    },
    ownKeys(t) {
      return [...new Set([...Reflect.ownKeys(mod), ...Reflect.ownKeys(t)])];
    },
    getOwnPropertyDescriptor(t, prop) {
      const own = Object.getOwnPropertyDescriptor(mod, prop);
      if (own) return { ...own, configurable: true };
      return Reflect.getOwnPropertyDescriptor(t, prop);
    },
  });
}

function recordHelperIncluded(helpers: HelperMethodsModule, mod: object): void {
  let set = includedHelperModules.get(helpers);
  if (!set) {
    set = new WeakSet<object>();
    includedHelperModules.set(helpers, set);
  }
  set.add(mod);
}

export function clearHelpers(this: HelpersClass): void {
  const inheritedHelperMethods = this._helperMethods;
  this._helpers = Object.create(null) as HelperMethodsModule;
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
  static modulesForHelpers = Resolution.modulesForHelpers;
  static allHelpersFromPath = Resolution.allHelpersFromPath;
  static helperModulesFromPaths = Resolution.helperModulesFromPaths;

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
