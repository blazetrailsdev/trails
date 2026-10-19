import {
  callerLocations,
  camelize,
  classAttribute,
  Concern,
  constantize,
  extend,
  isAnonymous,
  kernelArray,
  NameError,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  Dir,
  include,
  isModuleIncluded,
  isPlainHash,
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

export type HelperMethodsModule = object;

export interface HelpersClassMethods {
  _helpers?: HelperMethodsModule;
  _helperMethods?: string[];
  name?: string;
}

export interface HelpersClass extends HelpersClassMethods {
  _helpers: HelperMethodsModule;
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
  constructor: { _helpers: HelperMethodsModule };
}

export function modulesForHelpers(
  modulesOrHelperPrefixes: HelperArgument[],
): HelperMethodsModule[] {
  return (modulesOrHelperPrefixes as unknown[]).flat(Infinity).map((moduleOrHelperPrefix) => {
    if (rbObjIsKindOf(moduleOrHelperPrefix, Module) || isPlainHash(moduleOrHelperPrefix)) {
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

/** @inventedArm replaceAll — PERMANENT */
export function allHelpersFromPath(path: string | string[]): string[] {
  const helpers = kernelArray(path).flatMap((_path) => {
    const names = Dir.glob(`${_path}/**/*{-,_}helper.{ts,js,rb}`).map((file) =>
      file.slice(String(_path).length + 1, -"_helper.rb".length).replaceAll("-", "_"),
    );
    return names.sort();
  });
  return [...new Set(helpers)];
}

export function helperModulesFromPaths(
  this: {
    modulesForHelpers(modulesOrHelperPrefixes: HelperArgument[]): HelperMethodsModule[];
    allHelpersFromPath(path: string | string[]): string[];
  },
  paths: string | string[],
): HelperMethodsModule[] {
  return this.modulesForHelpers(this.allHelpersFromPath(paths));
}

export const Resolution = { modulesForHelpers, allHelpersFromPath, helperModulesFromPaths };

/**
 * `_helpers` is a plain-object module, so a method defined here reaches only a
 * class that includes the module afterwards. A view context class built before
 * this call keeps the methods it copied, where Rails' includers share the
 * module's method table (`rb_include_module`, vendor/ruby/v3.3.11/class.c:1179);
 * CLAUDE.md, "A method defined on a module after it is included".
 *
 * @inventedArm if — PERMANENT
 * @inventedArm getScriptNameOrSourceURL — PERMANENT
 * @inventedArm getLineNumber — PERMANENT
 */
export function helperMethod(this: HelpersClass, ...methods: HelperMethodNameList[]): void {
  const flat = (methods as readonly unknown[]).flat(Infinity) as string[];
  this._helperMethods = [...this._helperMethods, ...flat];

  const location = callerLocations(1, 1)[0];
  const [file, line] = [
    location?.callSite?.getScriptNameOrSourceURL(),
    location?.callSite?.getLineNumber() ?? 1,
  ];

  for (const method of flat) {
    const attr = /^[A-Za-z_]\w*=$/.test(method) ? method.slice(0, -1) : method;
    const writer = this._helperMethods.includes(`${attr}=`);
    const mod = this._helpersForModification();
    Object.defineProperty(
      mod,
      attr,
      (0, eval)(
        `${"\n".repeat(line - 1)}(function (rbFSend, attr, writer) { return { ` +
          `get() { const controller = this.controller; ` +
          `if (attr in controller && typeof controller[attr] !== "function") return rbFSend(controller, attr); ` +
          `return (...args) => rbFSend(controller, attr, ...args); }, ` +
          `set: writer ? function (value) { rbFSend(this.controller, attr + "=", value); } : undefined, ` +
          `enumerable: true, configurable: true }; })` +
          (file ? `\n//# sourceURL=${file.replace(/[\r\n\u2028\u2029]/g, "")}` : ""),
      )(rbFSend, attr, writer),
    );
    if (method !== attr) {
      Object.defineProperty(mod, method, {
        value(this: { controller: object }, ...args: unknown[]): unknown {
          return rbFSend(this.controller, method, ...args);
        },
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
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
    if (isModuleIncluded(this._helpers, mod)) continue;
    include(this._helpersForModification(), mod);
  }

  if (block) {
    const mod = this._helpersForModification();
    block.call(mod, mod as Record<string, unknown>);
  }
}

export function clearHelpers(this: HelpersClass): void {
  const inheritedHelperMethods = this._helperMethods;
  this._helpers = {};
  this._helperMethods = [];

  inheritedHelperMethods.forEach((meth) => this.helperMethod(meth));
  if (!isAnonymous(this)) this.defaultHelperModuleBang();
}

/** @inventedArm if — PERMANENT */
export function _helpersForModification(this: HelpersClass): HelperMethodsModule {
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
  helpers: HelperMethodsModule | null = null,
): HelperMethodsModule {
  if (rbModConstDefined(klass, "HelperMethods", false)) {
    return rbModConstGet(klass, "HelperMethods") as HelperMethodsModule;
  }

  const mod: HelperMethodsModule = {};
  rbModConstSet(klass, "HelperMethods", mod);
  if (helpers != null) include(mod, helpers);
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
  (klass as { _helpers: HelperMethodsModule | null })._helpers = null;

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

/** @inventedArm if — PERMANENT */
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
  get _helpers(): HelperMethodsModule {
    return (this as unknown as HelpersHost).constructor._helpers;
  },
}) as Module<{ readonly _helpers: HelperMethodsModule }> & {
  ClassMethods: typeof ClassMethods;
} & typeof Resolution;
Helpers.ClassMethods = ClassMethods;

extend(Helpers, Resolution);
