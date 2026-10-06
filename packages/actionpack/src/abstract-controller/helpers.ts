import {
  callerLocations,
  camelize,
  classAttribute,
  Concern,
  constantize,
  extend,
  isAnonymous,
  NameError,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  isSymbol,
  Module,
  rbClassSuperclass,
  rbDeclareIvar,
  rbFSend,
  rbModConstDefined,
  rbModConstGet,
  rbModConstSet,
  rbModSingletonP,
  rbObjIsKindOf,
  rbObjIvarDefined,
  rbObjIvarGet,
  symbolToS,
} from "@blazetrails/ruby-compat";

export type HelperMethodsModule = Module;

export interface HelpersClassMethods {
  _helpers?: Module;
  _helperMethods?: string[];
  name?: string;
}

export interface HelpersClass extends HelpersClassMethods {
  _helpers: Module;
  _helperMethods: string[];
  name: string;
  helperMethod: typeof helperMethod;
  helper: typeof helper;
  clearHelpers: typeof clearHelpers;
  _helpersForModification: typeof _helpersForModification;
  defineHelpersModule: typeof defineHelpersModule;
  defaultHelperModuleBang: typeof defaultHelperModuleBang;
  modulesForHelpers: (typeof Resolution)["modulesForHelpers"];
}

type HelperArgument = HelperMethodsModule | string | HelperArgument[];

export type HelperMethodNameList = string | HelperMethodNameList[];

export interface HelpersHost {
  constructor: { _helpers: Module };
}

export function modulesForHelpers(
  modulesOrHelperPrefixes: HelperArgument[],
): HelperMethodsModule[] {
  return (modulesOrHelperPrefixes as unknown[]).flat(Infinity).map((moduleOrHelperPrefix) => {
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
}

export async function allHelpersFromPath(path: string | readonly string[]): Promise<string[]> {
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
}

export async function helperModulesFromPaths(
  this: {
    modulesForHelpers(modulesOrHelperPrefixes: HelperArgument[]): HelperMethodsModule[];
    allHelpersFromPath(path: string | readonly string[]): Promise<string[]>;
  },
  paths: string | readonly string[],
): Promise<HelperMethodsModule[]> {
  return this.modulesForHelpers(await this.allHelpersFromPath(paths));
}

export const Resolution = { modulesForHelpers, allHelpersFromPath, helperModulesFromPaths };

/** @inventedArm if — PERMANENT */
export function helperMethod(this: HelpersClass, ...methods: HelperMethodNameList[]): void {
  const flat = (methods as readonly unknown[]).flat(Infinity) as string[];
  this._helperMethods = [...this._helperMethods, ...flat];

  const location = callerLocations(1, 1)[0]?.callSite;
  const [file, line] = [location?.getScriptNameOrSourceURL(), location?.getLineNumber() ?? 1];

  for (const method of flat) {
    const attr = /^[A-Za-z_]\w*=$/.test(method) ? method.slice(0, -1) : method;
    const writer = this._helperMethods.includes(`${attr}=`);
    this._helpersForModification().moduleEval((mod) => {
      Object.defineProperty(
        mod,
        attr,
        (0, eval)(
          `${"\n".repeat(line - 1)}(function (rbFSend, attr, writer) { return { ` +
            `get() { const controller = this.controller; ` +
            `if (attr in controller && typeof controller[attr] !== "function") return rbFSend(controller, attr); ` +
            `return (...args) => rbFSend(controller, attr, ...args); }, ` +
            `set: writer ? function (value) { rbFSend(this.controller, attr + "=", value); } : undefined, ` +
            `configurable: true }; })` +
            (file ? `\n//# sourceURL=${file.replace(/[\r\n\u2028\u2029]/g, "")}` : ""),
        )(rbFSend, attr, writer),
      );
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
    if (this._helpers.isInclude(mod)) continue;
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

/** @inventedArm if — CONVERGEABLE helpers-inherited-resets-helpers-and-includes-default-module-first */
export function _helpersForModification(this: HelpersClass): Module {
  if (!rbObjIvarDefined(this, "@_helpers") && !rbModSingletonP(this as never)) {
    inherited.call(rbClassSuperclass(this)!, this);
  }
  if (rbObjIvarGet(this, "@_helpers") == null) {
    this._helpers = this.defineHelpersModule(this, rbClassSuperclass(this)!._helpers);
  }
  return this._helpers;
}

/** @internal */
export function defineHelpersModule(
  this: HelpersClass,
  klass: HelpersClass,
  helpers: Module | null = null,
): Module {
  if (rbModConstDefined(klass, "HelperMethods", false)) {
    return rbModConstGet(klass, "HelperMethods") as Module;
  }

  const mod = new Module();
  rbModConstSet(klass, "HelperMethods", mod);
  if (helpers != null) mod.include(helpers);
  return mod;
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

function inherited(this: HelpersClass, klass: HelpersClass): void {
  (klass as { _helpers: Module | null })._helpers = null;

  if (!isAnonymous(klass)) klass.defaultHelperModuleBang();
}

export const ClassMethods = new Module((mod) => {
  mod.attrWriter("_helpers");

  mod.include(Resolution);

  mod.defineMethod("helperMethod", helperMethod);
  mod.defineMethod("helper", helper);
  mod.defineMethod("clearHelpers", clearHelpers);
  mod.defineMethod("_helpersForModification", _helpersForModification);
  mod.defineMethod("defineHelpersModule", defineHelpersModule);
  mod.defineMethod("defaultHelperModuleBang", defaultHelperModuleBang);
});

/** @inventedArm if — CONVERGEABLE helpers-inherited-resets-helpers-and-includes-default-module-first */
export const Helpers = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: HelpersClass) => void): void }).included(
    null,
    function (this: HelpersClass) {
      classAttribute.call(this, "_helperMethods", { default: [] });

      rbDeclareIvar({ prototype: this }, "@_helpers", "__helpers");
      Object.defineProperty(this, "_helpers", {
        configurable: true,
        get(this: HelpersClass) {
          if (!rbObjIvarDefined(this, "@_helpers") && !rbModSingletonP(this as never)) {
            inherited.call(rbClassSuperclass(this)!, this);
          }
          if (rbObjIvarGet(this, "@_helpers") != null) {
            return rbObjIvarGet(this, "@_helpers");
          } else {
            return rbClassSuperclass(this)!._helpers;
          }
        },
        set: ClassMethods.instanceMethod("_helpers")!.set,
      });

      this._helpers = this.defineHelpersModule(this);
    },
  );
}).include({
  get _helpers(): Module {
    return (this as unknown as HelpersHost).constructor._helpers;
  },
}) as Module<{ readonly _helpers: Module }> & {
  ClassMethods: typeof ClassMethods;
} & typeof Resolution;
Helpers.ClassMethods = ClassMethods;

extend(Helpers, Resolution);
