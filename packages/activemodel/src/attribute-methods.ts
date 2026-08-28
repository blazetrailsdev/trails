import {
  camelize,
  classAttribute,
  CodeGenerator,
  extend,
  include,
  included,
  prepend,
  type Extended,
  type Included,
  Module,
  NameError,
} from "@blazetrails/activesupport";

export interface AttributeMethods {
  attributeMissing(match: AttributeMethod, ...args: unknown[]): unknown;
  respondTo(method: string): boolean;
}

const __FILE__ = import.meta.url;
const __LINE__ = 0;

export class MissingAttributeError extends globalThis.Error {
  constructor(message?: string) {
    super(message);
    this.name = "MissingAttributeError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AttrNames {
  const DEF_SAFE_NAME = /^[a-zA-Z_]\w*$/;

  export function defineAttributeAccessorMethod(
    owner: unknown,
    attrName: string,
    { writer = false }: { writer?: boolean } = {},
  ): { methodName: string; attrNameRef: string } {
    const methodName = writer ? `${attrName}=` : attrName;
    if (DEF_SAFE_NAME.test(attrName)) {
      return { methodName, attrNameRef: `'${attrName}'` };
    }
    const escaped = attrName
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    return { methodName, attrNameRef: `'${escaped}'` };
  }
}

export class AttributeMethod {
  constructor(
    readonly proxyTarget: string,
    readonly attrName: string,
  ) {}
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

interface ReadWriteHost {
  /** @internal */
  _readAttribute(attr: string): unknown;
  /** @internal */
  _writeAttribute(name: string, value: unknown): void;
  [key: string]: unknown;
}

class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
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

interface ClassMethodsHost extends AttributeMethodHost, Extended<typeof ClassMethods> {}

export interface InstanceHost {
  _attributes?: { isKey(name: string): boolean };
  attributes: Record<string, unknown>;
  attributeMethodPatterns?: AttributeMethodPattern[];
  constructor: AttributeMethodHost;
}

interface InstanceMethodsHost extends InstanceHost, Included<typeof InstanceMethods> {
  constructor: ClassMethodsHost;
}

const NAME_COMPILABLE_REGEXP = /^[a-zA-Z_]\w*[!?=]?$/;

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
    this.defineAttributeMethodPattern(pattern, oldName, {
      owner: codeGenerator,
      as: newName,
      override: true,
    });
  },

  isAttributeAlias(this: ClassMethodsHost, name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attributeAliases, name);
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

    const generateMethod = pattern.proxyTarget.endsWith("=")
      ? camelize(`set_define_method_${pattern.proxyTarget.slice(0, -1)}`, false)
      : camelize(`define_method_${pattern.proxyTarget}`, false);

    const generator = (this as unknown as Record<string, unknown>)[generateMethod];
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
    return this.attributeAliases?.[name] ?? name;
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
   * @missingRailsArgs new — PERMANENT
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
    const hex = Array.from(name)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    return `__temp__${hex}`;
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
      batch.push((mod) => {
        if (parameters === false) {
          Object.defineProperty(mod, mangledName, {
            get(this: ReadWriteHost) {
              return sendProxyTarget(this, targetName, callArgs);
            },
            configurable: true,
          });
          return;
        }
        Object.defineProperty(mod, mangledName, {
          value: function (this: ReadWriteHost, ...args: unknown[]) {
            return sendProxyTarget(this, targetName, [...callArgs, ...args]);
          },
          writable: true,
          configurable: true,
        });
      });
    });
  },
};

export const InstanceMethods = {
  attributeMissing(
    this: Record<string, unknown>,
    match: AttributeMethod,
    ...args: unknown[]
  ): unknown {
    const target = (this as Record<string, (...a: unknown[]) => unknown>)[match.proxyTarget];
    if (typeof target !== "function") {
      throw new MissingAttributeError(
        `attribute_missing dispatch failed: ${match.proxyTarget} not defined`,
      );
    }
    return target.call(this, match.attrName, ...args);
  },

  isRespondToWithoutAttributes(this: object, method: string): boolean {
    return method in (this as Record<string, unknown>);
  },

  /** @missingRailsCall super — PERMANENT */
  respondTo(
    this: InstanceMethodsHost,
    method: string,
    includePrivateMethods: boolean = false,
  ): boolean {
    void includePrivateMethods;
    if (this.isRespondToWithoutAttributes(method)) {
      return true;
    } else {
      return this.matchedAttributeMethod(String(method)) !== null;
    }
  },

  /** @internal */
  isAttributeMethod(this: InstanceMethodsHost, attrName: string): boolean {
    return (
      this.isRespondToWithoutAttributes("attributes") && Object.hasOwn(this.attributes, attrName)
    );
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
      const match = this.matchedAttributeMethod(attr);
      if (match) return this.attributeMissing(match);
      throw new NoMethodError(
        `undefined method '${attr}' for an instance of ${(this.constructor as { name?: string }).name ?? "unknown"}`,
      );
    }
    return (this as unknown as Record<string, unknown>)[attr];
  },
};

export const AttributeMethods = {
  ClassMethods,
  InstanceMethods,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
  [included](base: (new (...args: any[]) => any) & { prototype: object }): void {
    include(base, InstanceMethods);
    extend(base, ClassMethods);

    classAttribute.call(base, "attributeAliases", { instanceWriter: false, default: {} });
    classAttribute.call(base, "attributeMethodPatterns", {
      instanceWriter: false,
      default: [new AttributeMethodPattern()],
    });
    prepend(base.prototype, { initInternals });
  },
};

function sendProxyTarget(record: ReadWriteHost, targetName: string, args: unknown[]): unknown {
  const target = record[targetName] as ((...a: unknown[]) => unknown) | undefined;
  if (typeof target !== "function") {
    const [attrName, ...rest] = args as [string, ...unknown[]];
    return (record as unknown as AttributeMethods).attributeMissing(
      { proxyTarget: targetName, attrName },
      ...rest,
    );
  }
  return target.call(record, ...args);
}

/**
 * @noRailsEquivalent Peels Ruby's trailing `parameters:` keyword back off the
 * splat that carries it — the arg-shape half of `attribute_method_prefix` /
 * `attribute_method_suffix`, which TS cannot spell as a real keyword after a
 * rest element.
 */
function extractParameters(
  affixes: Array<string | { parameters?: string | null | false }>,
): string | null | false {
  const last = affixes[affixes.length - 1];
  if (last === undefined || typeof last === "string") return null;
  affixes.pop();
  return last.parameters ?? null;
}

/** @noRailsEquivalent PERMANENT */
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
export function defineMethodAttribute(
  this: unknown,
  canonicalName: string,
  { owner, as = canonicalName }: { owner: CodeGenerator; as?: string },
): void {
  if (as === canonicalName && isDefinedByAClassBody(this, as)) return;
  const { methodName } = AttrNames.defineAttributeAccessorMethod(owner, canonicalName);
  const mangledName = ClassMethods.buildMangledName(methodName);
  owner.defineCachedMethod(mangledName, { namespace: "active_model", as }, (sources) => {
    sources.push((mod) => {
      Object.defineProperty(mod, mangledName, {
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
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function initInternals(this: { constructor: ClassMethodsHost }, super_: () => void): void {
  _resurrectAttributeMethods(this.constructor);
  super_();
}

export function _resurrectAttributeMethods(klass: ClassMethodsHost): void {
  const patterns = klass.attributeMethodPatterns;
  if (klass._patternsAtLastResurrection === patterns) return;
  klass._patternsAtLastResurrection = patterns;
  const stale = [...(klass._patternsGeneratedFor ?? [])]
    .filter(([, generatedWith]) => generatedWith !== patterns)
    .map(([attrName]) => attrName);
  if (stale.length > 0) klass.defineAttributeMethods(...stale);
}
