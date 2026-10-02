import {
  b,
  basicObjRespondTo,
  block,
  fetch,
  hasKey,
  isInclude,
  rbFSend,
  rbModConstDefined,
  rbModConstSet,
  unpack1,
} from "@blazetrails/ruby-compat";
import {
  camelize,
  classAttribute,
  CodeGenerator,
  extend,
  include,
  included,
  type Extended,
  type Included,
  Module,
} from "@blazetrails/activesupport";
import { NoMethodError } from "./attribute-assignment.js";
import { AttributeRegistration } from "./attribute-registration.js";

export interface AttributeMethods {
  methodMissing(method: string, ...args: unknown[]): unknown;
  attributeMissing(match: AttributeMethod, ...args: unknown[]): unknown;
  isRespondTo(method: string): boolean;
}

const __FILE__ = import.meta.url;
const __LINE__ = 0;

export class MissingAttributeError extends globalThis.Error {
  constructor(message?: string) {
    super(message);
    this.name = "MissingAttributeError";
  }
}

export class AttrNames {
  static readonly DEF_SAFE_NAME = /^[a-zA-Z_]\w*$/;

  static defineAttributeAccessorMethod(
    owner: unknown,
    attrName: string,
    { writer = false }: { writer?: boolean },
    block: (tempMethodName: string, attrNameExpr: string) => void,
  ): void {
    const methodName = `${attrName}${writer ? "=" : ""}`;
    // eslint-disable-next-line no-control-regex -- Ruby's `ascii_only?` (attribute_methods.rb:579)
    if (/^[\x00-\x7f]*$/.test(attrName) && AttrNames.DEF_SAFE_NAME.test(attrName)) {
      block(methodName, `'${attrName}'`);
    } else {
      const safeName = unpack1(b(attrName), "h*");
      const constName = `ATTR_${safeName}`;
      if (!rbModConstDefined(this, constName)) rbModConstSet(this, constName, attrName);
      const tempMethodName = `__temp__${safeName}${writer ? "=" : ""}`;
      const attrNameExpr = `::ActiveModel::AttributeMethods::AttrNames::${constName}`;
      block(tempMethodName, attrNameExpr);
    }
  }
}

export class AttributeMethodPattern {
  readonly prefix: string;
  readonly suffix: string;
  readonly proxyTarget: string;
  readonly parameters: string | false;

  constructor({
    prefix = "",
    suffix = "",
    parameters = null,
  }: { prefix?: string; suffix?: string; parameters?: string | null | false } = {}) {
    const bang = suffix.endsWith("!");
    this.prefix = prefix;
    this.suffix = bang ? suffix.slice(0, -1) : suffix;
    this.parameters = parameters == null ? "..." : bang && parameters === false ? "" : parameters;
    this.proxyTarget = `${prefix}${this.camelJoined ? "Attribute" : "attribute"}${this.suffix}${
      bang ? "Bang" : ""
    }`;
  }

  match(methodName: string): AttributeMethod | null {
    if (this.prefix && !methodName.startsWith(this.prefix)) return null;
    if (this.suffix && !methodName.endsWith(this.suffix)) return null;
    const attr = methodName.slice(
      this.prefix.length,
      this.suffix ? -this.suffix.length : undefined,
    );
    if (!attr) return null;
    return new AttributeMethod(
      this.proxyTarget,
      this.camelJoined ? attr.charAt(0).toLowerCase() + attr.slice(1) : attr,
    );
  }

  methodName(attrName: string): string {
    const name = this.camelJoined ? attrName.charAt(0).toUpperCase() + attrName.slice(1) : attrName;
    return `${this.prefix}${name}${this.suffix}`;
  }

  private get camelJoined(): boolean {
    return this.prefix !== "" && !this.prefix.endsWith("_");
  }
}

export class AttributeMethod {
  constructor(
    readonly proxyTarget: string,
    readonly attrName: string,
  ) {}
}

export interface ReadWriteHost {
  /** @internal */
  _readAttribute(attr: string): unknown;
  /** @internal */
  _writeAttribute(name: string, value: unknown): void;
  [key: string]: unknown;
}

export interface AttributeMethodHost {
  attributeNames(): string[];
  attributeMethodPatterns: AttributeMethodPattern[];
  /** @internal */
  _patternsGeneratedFor?: Map<string, AttributeMethodPattern[]>;
  /** @internal */
  _patternsAtLastResurrection?: AttributeMethodPattern[];
  attributeAliases: Record<string, string>;
  _aliasesByAttributeName: Map<string, string[]>;
  _generatedAttributeMethods?: Module;
}

export interface ClassMethodsHost extends AttributeMethodHost, Extended<typeof ClassMethods> {}

export interface InstanceHost {
  _attributes?: { isKey(name: string): boolean };
  attributes: Record<string, unknown>;
  attributeMethodPatterns?: AttributeMethodPattern[];
  constructor: AttributeMethodHost;
}

export interface InstanceMethodsHost extends InstanceHost, Included<typeof AttributeMethods> {
  constructor: ClassMethodsHost;
}

const NAME_COMPILABLE_REGEXP = /^[a-zA-Z_]\w*[!?=]?$/;
const CALL_COMPILABLE_REGEXP = /^[a-zA-Z_]\w*[!?]?$/;

export const ClassMethods = {
  attributeMethodPrefix(
    this: ClassMethodsHost,
    ...prefixes: Array<string | { parameters?: string | null | false }>
  ): void {
    const parameters = extractParameters(prefixes);
    this.attributeMethodPatterns = [
      ...this.attributeMethodPatterns,
      ...(prefixes as string[]).map((prefix) => new AttributeMethodPattern({ prefix, parameters })),
    ];
    this.undefineAttributeMethods();
  },

  attributeMethodSuffix(
    this: ClassMethodsHost,
    ...suffixes: Array<string | { parameters?: string | null | false }>
  ): void {
    const parameters = extractParameters(suffixes);
    this.attributeMethodPatterns = [
      ...this.attributeMethodPatterns,
      ...(suffixes as string[]).map((suffix) => new AttributeMethodPattern({ suffix, parameters })),
    ];
    this.undefineAttributeMethods();
  },

  attributeMethodAffix(
    this: ClassMethodsHost,
    ...affixes: Array<{ prefix: string; suffix: string; parameters?: string | null | false }>
  ): void {
    this.attributeMethodPatterns = [
      ...this.attributeMethodPatterns,
      ...affixes.map((affix) => new AttributeMethodPattern(affix)),
    ];
    this.undefineAttributeMethods();
  },

  aliasAttribute(this: ClassMethodsHost, newName: string, oldName: string): void {
    this.attributeAliases = { ...this.attributeAliases, [newName]: oldName };
    const aliases = this.aliasesByAttributeName();
    if (!aliases.has(oldName)) aliases.set(oldName, []);
    aliases.get(oldName)!.push(newName);

    this.eagerlyGenerateAliasAttributeMethods(newName, oldName);
  },

  eagerlyGenerateAliasAttributeMethods(
    this: ClassMethodsHost,
    newName: string,
    oldName: string,
  ): void {
    CodeGenerator.batch(this.generatedAttributeMethods(), __FILE__, __LINE__, (codeGenerator) => {
      this.generateAliasAttributeMethods(codeGenerator, newName, oldName);
    });
  },

  generateAliasAttributeMethods(
    this: ClassMethodsHost,
    codeGenerator: CodeGenerator,
    newName: string,
    oldName: string,
  ): void {
    CodeGenerator.batch(codeGenerator, __FILE__, __LINE__, () => {
      for (const pattern of this.attributeMethodPatterns) {
        this.aliasAttributeMethodDefinition(codeGenerator, pattern, newName, oldName);
      }
      this.attributeMethodPatternsCache().clear();
    });
  },

  aliasAttributeMethodDefinition(
    this: ClassMethodsHost,
    codeGenerator: CodeGenerator,
    pattern: AttributeMethodPattern,
    newName: string,
    oldName: string,
  ): void {
    const methodName = pattern.methodName(newName);
    const targetName = pattern.methodName(oldName);
    const parameters = pattern.parameters;

    if (
      typeof (this as unknown as Record<string, unknown>)[generateMethodFor(pattern)] === "function"
    ) {
      this.defineAttributeMethodPattern(pattern, oldName, {
        owner: codeGenerator,
        as: newName,
        override: true,
      });
      return;
    }

    const mangledName = this.buildMangledName(targetName);

    const callArgs: string[] = [];

    this.defineCall(codeGenerator, methodName, targetName, mangledName, parameters, callArgs, {
      namespace: "alias_attribute",
      as: methodName,
    });
  },

  isAttributeAlias(this: ClassMethodsHost, newName: string): boolean {
    return hasKey(this.attributeAliases, newName);
  },

  attributeAlias(this: ClassMethodsHost, name: string): string | undefined {
    return this.attributeAliases[name];
  },

  defineAttributeMethods(this: ClassMethodsHost, ...attrNames: string[]): void {
    CodeGenerator.batch(this.generatedAttributeMethods(), __FILE__, __LINE__, (owner) => {
      for (const attrName of attrNames) {
        this.defineAttributeMethod(attrName, { _owner: owner });
        const aliases = this.aliasesByAttributeName();
        const attrAliases = aliases.get(attrName);
        if (attrAliases) {
          for (const aliasedName of attrAliases) {
            this.generateAliasAttributeMethods(owner, aliasedName, attrName);
          }
        }
      }
    });
  },

  defineAttributeMethod(
    this: ClassMethodsHost,
    attrName: string,
    options: { _owner?: Module | CodeGenerator; as?: string } = {},
  ): void {
    const { _owner = this.generatedAttributeMethods(), as = attrName } = options;
    CodeGenerator.batch(_owner, __FILE__, __LINE__, (owner) => {
      for (const pattern of this.attributeMethodPatterns) {
        this.defineAttributeMethodPattern(pattern, attrName, { owner, as });
      }
      this.attributeMethodPatternsCache().clear();
    });
    if (!Object.prototype.hasOwnProperty.call(this, "_patternsGeneratedFor")) {
      this._patternsGeneratedFor = new Map(this._patternsGeneratedFor ?? []);
    }
    this._patternsGeneratedFor!.set(as, this.attributeMethodPatterns);
  },

  defineAttributeMethodPattern(
    this: ClassMethodsHost,
    pattern: AttributeMethodPattern,
    attrName: string,
    { owner, as, override = false }: { owner: CodeGenerator; as: string; override?: boolean },
  ): void {
    const canonicalMethodName = pattern.methodName(attrName);
    const publicMethodName = pattern.methodName(as);

    if (this.isInstanceMethodAlreadyImplemented(publicMethodName)) {
      if (!override) return;
    }

    if (pattern.parameters === false && !override && answersWithAMethod(this, publicMethodName)) {
      return;
    }

    const generator = (this as unknown as Record<string, unknown>)[generateMethodFor(pattern)];
    if (typeof generator === "function") {
      (generator as (attrName: string, options: { owner: CodeGenerator; as: string }) => void).call(
        this,
        attrName,
        { owner, as },
      );
    } else {
      this.defineProxyCall(
        owner,
        canonicalMethodName,
        pattern.proxyTarget,
        pattern.parameters,
        attrName,
        {
          namespace: "active_model_proxy",
          as: publicMethodName,
        },
      );
    }
  },

  undefineAttributeMethods(this: ClassMethodsHost): void {
    const mod = this.generatedAttributeMethods();
    mod.undefMethod(...mod.instanceMethods());
    if (Object.hasOwn(this, "_attributeMethodPatternsCache")) {
      (
        this as ClassMethodsHost & { _attributeMethodPatternsCache: Map<unknown, unknown> }
      )._attributeMethodPatternsCache.clear();
    }
  },

  aliasesByAttributeName(this: ClassMethodsHost): Map<string, string[]> {
    if (!Object.prototype.hasOwnProperty.call(this, "_aliasesByAttributeName")) {
      this._aliasesByAttributeName = new Map<string, string[]>();
    }
    return this._aliasesByAttributeName;
  },

  /** @internal */
  resolveAttributeName(this: ClassMethodsHost, name: string): string {
    return fetch(
      this.attributeAliases,
      AttributeRegistration.ClassMethods.resolveAttributeName.call(this, name),
      block((key) => key),
    );
  },

  /** @internal */
  generatedAttributeMethods(this: ClassMethodsHost): Module {
    if (!Object.hasOwn(this, "_generatedAttributeMethods")) {
      const mod = new Module();
      include(this as unknown as new (...args: unknown[]) => unknown, mod);
      this._generatedAttributeMethods = mod;
    }
    return this._generatedAttributeMethods!;
  },

  /** @internal */
  isInstanceMethodAlreadyImplemented(this: ClassMethodsHost, methodName: string): boolean {
    return this.generatedAttributeMethods().isMethodDefined(methodName);
  },

  /**
   * @internal
   * @missingRailsArgs new — CONVERGEABLE attribute-method-patterns-cache-onto-concurrent-map
   */
  attributeMethodPatternsCache(this: ClassMethodsHost): Map<string, Array<AttributeMethod>> {
    const h = this as AttributeMethodHost & {
      _attributeMethodPatternsCache?: Map<string, Array<AttributeMethod>>;
    };
    if (!Object.prototype.hasOwnProperty.call(h, "_attributeMethodPatternsCache")) {
      h._attributeMethodPatternsCache = new Map();
    }
    return h._attributeMethodPatternsCache!;
  },

  /** @internal */
  attributeMethodPatternsMatching(
    this: ClassMethodsHost,
    methodName: string,
  ): Array<AttributeMethod> {
    const cache = this.attributeMethodPatternsCache();
    if (cache.has(methodName)) return cache.get(methodName)!;
    const matches = this.attributeMethodPatterns.flatMap((pattern) => {
      const m = pattern.match(methodName);
      return m ? [m] : [];
    });
    cache.set(methodName, matches);
    return matches;
  },

  /** @internal */
  defineProxyCall(
    this: ClassMethodsHost,
    codeGenerator: CodeGenerator,
    name: string,
    proxyTarget: string,
    parameters: string | null | false,
    ...rest: [...callArgs: string[], options: { namespace: string; as?: string }]
  ): void {
    const options = rest[rest.length - 1] as { namespace: string; as?: string };
    const callArgs = rest.slice(0, -1) as string[];
    const mangledName = this.buildMangledName(name);

    const namespace = `${options.namespace}_${proxyTarget}`;

    this.defineCall(codeGenerator, name, proxyTarget, mangledName, parameters, callArgs, {
      namespace,
      as: options.as ?? name,
    });
  },

  /** @internal */
  buildMangledName(name: string): string {
    if (NAME_COMPILABLE_REGEXP.test(name)) return name;
    return `__temp__${unpack1(b(name), "h*")}`;
  },

  /** @internal */
  defineCall(
    codeGenerator: CodeGenerator,
    _name: string,
    targetName: string,
    mangledName: string,
    parameters: string | null | false,
    callArgs: string[],
    { namespace, as }: { namespace: string; as: string },
  ): void {
    codeGenerator.defineCachedMethod(mangledName, { namespace, as }, (batch) => {
      let body: (self: ReadWriteHost, args: unknown[]) => unknown;
      if (CALL_COMPILABLE_REGEXP.test(targetName)) {
        body = (self, args) => rbFSend(self, targetName, ...callArgs, ...args);
      } else {
        callArgs.unshift(targetName);
        body = (self, args) => rbFSend(self, ...(callArgs as [string, ...string[]]), ...args);
      }

      batch.push((mod) => {
        if (parameters === false) {
          Object.defineProperty(mod, mangledName, {
            get(this: ReadWriteHost) {
              return body(this, []);
            },
            configurable: true,
          });
          return;
        }
        Object.defineProperty(mod, mangledName, {
          value: function (this: ReadWriteHost, ...args: unknown[]) {
            return body(this, args);
          },
          writable: true,
          configurable: true,
        });
      });
    });
  },
};

export const AttributeMethods = {
  ClassMethods,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
  [included](base: (new (...args: any[]) => any) & { prototype: object }): void {
    extend(base, ClassMethods);

    classAttribute.call(base, "attributeAliases", { instanceWriter: false, default: {} });
    classAttribute.call(base, "attributeMethodPatterns", {
      instanceWriter: false,
      default: [new AttributeMethodPattern()],
    });
    include(base, SuperMethods);
  },

  methodMissing(this: InstanceMethodsHost, method: string, ...args: unknown[]): unknown {
    if (this.isRespondToWithoutAttributes(method, true)) {
      throw new NoMethodError(
        `undefined method '${method}' for an instance of ${(this.constructor as { name?: string }).name ?? "unknown"}`,
      );
    } else {
      const match = this.matchedAttributeMethod(method);
      if (match) return this.attributeMissing(match, ...args);
      throw new NoMethodError(
        `undefined method '${method}' for an instance of ${(this.constructor as { name?: string }).name ?? "unknown"}`,
      );
    }
  },

  attributeMissing(
    this: Record<string, unknown>,
    match: AttributeMethod,
    ...args: unknown[]
  ): unknown {
    const target = (this as Record<string, (...a: unknown[]) => unknown>)[match.proxyTarget];
    if (typeof target !== "function") {
      throw new NoMethodError(
        `undefined method '${match.proxyTarget}' for an instance of ${(this as { constructor?: { name?: string } }).constructor?.name ?? "unknown"}`,
      );
    }
    return target.call(this, match.attrName, ...args);
  },

  isRespondToWithoutAttributes(
    this: object,
    method: string,
    includePrivateMethods: boolean = false,
  ): boolean {
    return basicObjRespondTo(this, method, !includePrivateMethods);
  },

  isRespondTo(
    this: InstanceMethodsHost,
    method: string,
    includePrivateMethods: boolean = false,
  ): boolean {
    if (basicObjRespondTo(this, method, !includePrivateMethods)) {
      return true;
    } else if (!includePrivateMethods && basicObjRespondTo(this, method, false)) {
      return false;
    } else {
      return this.matchedAttributeMethod(String(method)) !== null;
    }
  },

  /** @internal */
  isAttributeMethod(this: InstanceMethodsHost, attrName: string): boolean {
    return this.isRespondToWithoutAttributes("attributes") && isInclude(this.attributes, attrName);
  },

  /** @internal */
  matchedAttributeMethod(this: InstanceMethodsHost, methodName: string): AttributeMethod | null {
    const matches = this.constructor.attributeMethodPatternsMatching(methodName);
    return matches.find((m) => this.isAttributeMethod(m.attrName)) ?? null;
  },

  /** @internal */
  missingAttribute(this: InstanceHost, attrName: string, stack?: string): never {
    const err = new MissingAttributeError(
      `missing attribute '${attrName}' for ${(this.constructor as { name?: string }).name ?? "unknown"}`,
    );
    if (stack !== undefined) err.stack = stack;
    throw err;
  },

  /** @internal */
  _readAttribute(this: InstanceMethodsHost, attr: string): unknown {
    if (!this.isRespondToWithoutAttributes(attr)) {
      return this.methodMissing(attr);
    }
    return (this as unknown as Record<string, unknown>)[attr];
  },
};

/** @noRailsEquivalent CONVERGEABLE attribute-methods-inline-generate-method-and-affix-parameters */
function generateMethodFor(pattern: AttributeMethodPattern): string {
  return pattern.proxyTarget.endsWith("=")
    ? camelize(`set_define_method_${pattern.proxyTarget.slice(0, -1)}`, false)
    : camelize(`define_method_${pattern.proxyTarget}`, false);
}

/** @noRailsEquivalent CONVERGEABLE attribute-methods-inline-generate-method-and-affix-parameters */
function extractParameters(
  affixes: Array<string | { parameters?: string | null | false }>,
): string | null | false {
  const last = affixes[affixes.length - 1];
  if (last === undefined || typeof last === "string") return null;
  affixes.pop();
  return last.parameters ?? null;
}

/** @noRailsEquivalent PERMANENT */
function answersWithAMethod(klass: unknown, name: string): boolean {
  const start = (klass as { prototype?: object }).prototype;
  for (
    let link: object | null = start ?? null;
    link;
    link = Object.getPrototypeOf(link) as object | null
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(link, name);
    if (!descriptor) continue;
    return typeof descriptor.value === "function";
  }
  return false;
}

function isDefinedByAClassBody(klass: unknown, name: string): boolean {
  const start = (klass as { prototype?: object }).prototype;
  for (
    let link: object | null = start ?? null;
    link;
    link = Object.getPrototypeOf(link) as object | null
  ) {
    if (!Object.prototype.hasOwnProperty.call(link, name)) continue;
    return Object.prototype.hasOwnProperty.call(link, "constructor");
  }
  return false;
}

/** @noRailsEquivalent PERMANENT */
export function completeHalfAccessor(
  klass: unknown,
  name: string,
  half: "get" | "set",
  fn: (this: never, ...args: never[]) => unknown,
): void {
  const proto = (klass as { prototype?: object }).prototype;
  if (proto == null) return;
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  if (desc == null || "value" in desc || desc[half] != null) return;
  Object.defineProperty(proto, name, { ...desc, [half]: fn, configurable: true });
}

/** @noRailsEquivalent PERMANENT */
export function defineMethodAttribute(
  this: unknown,
  canonicalName: string,
  { owner, as = canonicalName }: { owner: CodeGenerator; as?: string },
): void {
  if (as === canonicalName && isDefinedByAClassBody(this, as)) return;
  AttrNames.defineAttributeAccessorMethod(owner, canonicalName, {}, (tempMethodName) => {
    owner.defineCachedMethod(tempMethodName, { namespace: "active_model", as }, (sources) => {
      sources.push((mod) => {
        Object.defineProperty(mod, tempMethodName, {
          get(
            this: ReadWriteHost & {
              attribute(n: string): unknown;
              _attributes: { getAttribute(n: string): { isInitialized(): boolean } };
            },
          ) {
            if (!this._attributes.getAttribute(canonicalName).isInitialized()) {
              throw new MissingAttributeError(
                `missing attribute '${canonicalName}' for ${(this.constructor as { name?: string }).name ?? "unknown"}`,
              );
            }
            return this.attribute(canonicalName);
          },
          set(this: ReadWriteHost, value: unknown) {
            this._writeAttribute(canonicalName, value);
          },
          configurable: true,
        });
      });
    });
  });
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE attribute-methods-construction-time-resurrection-has-no-rails-site
 */
export function initInternals(this: { constructor: ClassMethodsHost }): void {
  _resurrectAttributeMethods(this.constructor);
  SuperMethods.superMethod(this, "initInternals")!();
}

const SuperMethods = new Module((mod) => mod.defineMethod("initInternals", initInternals));

export function _resurrectAttributeMethods(klass: ClassMethodsHost): void {
  const patterns = klass.attributeMethodPatterns;
  if (klass._patternsAtLastResurrection === patterns) return;
  klass._patternsAtLastResurrection = patterns;
  const stale = [...(klass._patternsGeneratedFor ?? [])]
    .filter(([, generatedWith]) => generatedWith !== patterns)
    .map(([attrName]) => attrName);
  if (stale.length > 0) klass.defineAttributeMethods(...stale);
}
