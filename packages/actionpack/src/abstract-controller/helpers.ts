import { camelize, demodulize, NameError } from "@blazetrails/activesupport";

/** @internal */

export type HelperMethodsModule = Record<string, (...args: unknown[]) => unknown>;

export interface HelpersClassMethods {
  _helpers?: HelperMethodsModule;
  _helperMethods?: string[];
  name?: string;
}

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

export function helperMethod(cls: HelpersClassMethods, ...names: HelperMethodNameList[]): void {
  const flat = (names as readonly unknown[]).flat(Infinity) as string[];
  if (flat.length === 0) return;
  cls._helperMethods = [...(cls._helperMethods ?? []), ...flat];
  const mod = _helpersForModification(cls);
  for (const name of flat) {
    mod[name] = function (this: { controller: Record<string, unknown> }, ...args: unknown[]) {
      const fn = this.controller[name];
      if (typeof fn !== "function") {
        throw new TypeError(`helper_method: controller does not respond to '${name}'`);
      }
      return (fn as (...a: unknown[]) => unknown).apply(this.controller, args);
    };
  }
}

export function helper(
  cls: HelpersClassMethods,
  ...args: Array<HelperMethodsModule | ((mod: HelperMethodsModule) => void)>
): void {
  for (const arg of args) {
    if (typeof arg === "function") {
      arg(_helpersForModification(cls));
    } else if (arg && typeof arg === "object") {
      if (isHelperIncluded(cls._helpers, arg)) continue;
      const head = _helpersForModification(cls);
      const currentTail = Object.getPrototypeOf(head) as object | null;
      const link = makeIncludeLink(arg, currentTail);
      Object.setPrototypeOf(head, link);
      recordHelperIncluded(head, arg);
    }
  }
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

export function clearHelpers(cls: HelpersClassMethods): void {
  const inherited = [...(cls._helperMethods ?? [])];
  cls._helpers = Object.create(null) as HelperMethodsModule;
  cls._helperMethods = [];
  helperMethod(cls, ...inherited);
}

export function _helpersForModification(cls: HelpersClassMethods): HelperMethodsModule {
  if (Object.prototype.hasOwnProperty.call(cls, "_helpers") && cls._helpers) {
    return cls._helpers;
  }
  const inherited = cls._helpers ?? null;
  const child = Object.create(inherited) as HelperMethodsModule;
  cls._helpers = child;
  return child;
}

export type HelperResolver = (name: string) => HelperMethodsModule | undefined;

export interface ResolutionOptions {
  resolve: HelperResolver;
}

export function modulesForHelpers(
  args: ReadonlyArray<HelperMethodsModule | string | symbol | Array<unknown>>,
  options: ResolutionOptions,
): HelperMethodsModule[] {
  const flat = (args as readonly unknown[]).flat(Infinity);
  return flat.map((arg) => {
    if (arg && typeof arg === "object") {
      for (const v of Object.values(arg)) {
        if (typeof v !== "function") {
          throw new TypeError("helper must be a String, Symbol, or Module");
        }
      }
      return arg as HelperMethodsModule;
    }
    if (typeof arg === "string" || typeof arg === "symbol") {
      const raw = typeof arg === "symbol" ? (arg.description ?? "") : arg;
      const name = `${/^[A-Z]/.test(raw) ? raw : camelizeHelperPrefix(raw)}Helper`;
      const mod = options.resolve(name);
      if (!mod) throw new NameError(`uninitialized constant ${name}`, demodulize(name));
      return mod;
    }
    throw new TypeError("helper must be a String, Symbol, or Module");
  });
}

export async function allHelpersFromPath(path: string | readonly string[]): Promise<string[]> {
  const modName = ["@blazetrails", "activesupport", "glob"].join("/");
  const { glob } = (await import(modName)) as typeof import("@blazetrails/activesupport/glob");
  const roots = typeof path === "string" ? [path] : path;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const matches = await glob("**/*_helper.{ts,js,rb}", { cwd: root });
    const names = matches.map((f) => f.replace(/\.(ts|js|rb)$/, "").replace(/_helper$/, "")).sort();
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

export async function helperModulesFromPaths(
  paths: string | readonly string[],
  options: ResolutionOptions,
): Promise<HelperMethodsModule[]> {
  const names = await allHelpersFromPath(paths);
  return modulesForHelpers(names, options);
}

/** @internal */
export function defaultHelperModuleBang(
  cls: HelpersClassMethods,
  options: ResolutionOptions,
): void {
  const className = cls.name;
  if (!className) return;
  const helperPrefix = className.replace(/Controller$/, "");
  const expectedName = `${/^[A-Z]/.test(helperPrefix) ? helperPrefix : camelize(helperPrefix)}Helper`;
  try {
    const [mod] = modulesForHelpers([helperPrefix], options);
    helper(cls, mod);
  } catch (err) {
    if (err instanceof NameError && err.isMissingName(expectedName)) return;
    throw err;
  }
}

function camelizeHelperPrefix(raw: string): string {
  return camelize(raw);
}
