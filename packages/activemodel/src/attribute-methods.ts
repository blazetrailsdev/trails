/**
 * AttributeMethods module — dynamic attribute method generation.
 *
 * Mirrors: ActiveModel::AttributeMethods
 *
 * In Rails, this module's ClassMethods are mixed into the class via `include`.
 * In TS, the exported functions use `this: AttributeMethodHost` so they can
 * be assigned directly to Model's static side — no delegation wrappers needed.
 */
export interface AttributeMethods {
  hasAttribute(name: string): boolean;
  attributePresent(name: string): boolean;
  attributeMissing(name: string): unknown;
  respondTo(method: string): boolean;
}

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
    attrName: string,
    writer: boolean = false,
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

export class AttributeMethodPattern {
  readonly prefix: string;
  readonly suffix: string;
  readonly proxyTarget: string;
  readonly parameters: string;
  readonly method_missing_target: string;

  constructor(prefix: string = "", suffix: string = "", parameters?: string) {
    this.prefix = prefix;
    this.suffix = suffix;
    this.parameters = parameters === undefined ? "..." : parameters;
    this.proxyTarget = `${prefix}attribute${suffix}`;
    this.method_missing_target = `attribute_${prefix}${suffix ? `${suffix}` : ""}`;
  }

  match(method: string): { attr: string } | null {
    if (this.prefix && !method.startsWith(this.prefix)) return null;
    if (this.suffix && !method.endsWith(this.suffix)) return null;
    const attr = method.slice(this.prefix.length, this.suffix ? -this.suffix.length : undefined);
    return attr ? { attr } : null;
  }

  methodName(attrName: string): string {
    return `${this.prefix}${attrName}${this.suffix}`;
  }
}

// ---------------------------------------------------------------------------
// ClassMethods — assigned directly to Model's static side
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

export interface AttributeMethodHost {
  _attributeDefinitions: Map<string, { name: string }>;
  _attributeMethodPatterns: AttributeMethodPattern[];
  _attributeAliases: Record<string, string>;
  _aliasesByAttributeName: Map<string, string[]>;
  _generatedMethods: Set<string>;
  prototype: AnyRecord;
}

function ensureOwnPatterns(host: AttributeMethodHost): void {
  if (!Object.prototype.hasOwnProperty.call(host, "_attributeMethodPatterns")) {
    host._attributeMethodPatterns = [...host._attributeMethodPatterns];
  }
}

function ensureOwnGeneratedMethods(host: AttributeMethodHost): void {
  if (!Object.prototype.hasOwnProperty.call(host, "_generatedMethods")) {
    host._generatedMethods = new Set(host._generatedMethods ?? []);
  }
}

function ensureOwnAliases(host: AttributeMethodHost): void {
  if (!Object.prototype.hasOwnProperty.call(host, "_attributeAliases")) {
    host._attributeAliases = { ...host._attributeAliases };
  }
}

export function aliasesByAttributeName(host: AttributeMethodHost): Map<string, string[]> {
  if (!Object.prototype.hasOwnProperty.call(host, "_aliasesByAttributeName")) {
    const parent = host._aliasesByAttributeName;
    const copy = new Map<string, string[]>();
    if (parent) {
      for (const [k, v] of parent) copy.set(k, [...v]);
    }
    host._aliasesByAttributeName = copy;
  }
  return host._aliasesByAttributeName;
}

// -- Public ClassMethods (use `this`, assigned to Model directly) -----------

export function attributeMethodPrefix(this: AttributeMethodHost, ...prefixes: string[]): void {
  ensureOwnPatterns(this);
  for (const prefix of prefixes) {
    this._attributeMethodPatterns.push(new AttributeMethodPattern(prefix, ""));
  }
  undefineAttributeMethods.call(this);
  defineAttributeMethods.call(this, ...Array.from(this._attributeDefinitions.keys()));
}

export function attributeMethodSuffix(this: AttributeMethodHost, ...suffixes: string[]): void {
  ensureOwnPatterns(this);
  for (const suffix of suffixes) {
    this._attributeMethodPatterns.push(new AttributeMethodPattern("", suffix));
  }
  undefineAttributeMethods.call(this);
  defineAttributeMethods.call(this, ...Array.from(this._attributeDefinitions.keys()));
}

export function attributeMethodAffix(
  this: AttributeMethodHost,
  ...affixes: Array<{ prefix: string; suffix: string }>
): void {
  ensureOwnPatterns(this);
  for (const { prefix, suffix } of affixes) {
    this._attributeMethodPatterns.push(new AttributeMethodPattern(prefix, suffix));
  }
  undefineAttributeMethods.call(this);
  defineAttributeMethods.call(this, ...Array.from(this._attributeDefinitions.keys()));
}

export function aliasAttribute(this: AttributeMethodHost, newName: string, oldName: string): void {
  ensureOwnAliases(this);
  this._attributeAliases[newName] = oldName;
  const aliases = aliasesByAttributeName(this);
  if (!aliases.has(oldName)) aliases.set(oldName, []);
  aliases.get(oldName)!.push(newName);

  // Define the direct alias property (bare name → original)
  ensureOwnGeneratedMethods(this);
  const getter = function (this: AnyRecord) {
    return this.readAttribute(oldName);
  };
  (getter as AnyRecord).__generatedAttributeMethod = true;
  Object.defineProperty(this.prototype, newName, {
    get: getter,
    set(this: AnyRecord, value: unknown) {
      this.writeAttribute(oldName, value);
    },
    configurable: true,
  });
  this._generatedMethods.add(newName);

  // Generate pattern-based alias methods (e.g., clear_fullName if clear_ prefix exists)
  eagerlyGenerateAliasAttributeMethods(this, newName, oldName);
}

export function undefineAttributeMethods(this: AttributeMethodHost): void {
  if (!this._generatedMethods) return;
  for (const methodName of this._generatedMethods) {
    const desc = Object.getOwnPropertyDescriptor(this.prototype, methodName);
    if (!desc) continue;
    // Only delete if the method is still the generated one (has our marker)
    const fn = desc.value ?? desc.get;
    if (fn && (fn as AnyRecord).__generatedAttributeMethod) {
      delete this.prototype[methodName];
    }
  }
  this._generatedMethods.clear();
}

export function defineAttributeMethods(this: AttributeMethodHost, ...attrNames: string[]): void {
  for (const attrName of attrNames) {
    defineAttributeMethod(this, attrName);
    const aliases = aliasesByAttributeName(this);
    const attrAliases = aliases.get(attrName);
    if (attrAliases) {
      for (const aliasedName of attrAliases) {
        generateAliasAttributeMethods(this, aliasedName, attrName);
      }
    }
  }
}

// -- Internal helpers (take explicit host arg) --------------------------------

export function defineAttributeMethod(host: AttributeMethodHost, attrName: string): void {
  for (const pattern of host._attributeMethodPatterns) {
    defineAttributeMethodPattern(host, pattern, attrName);
  }
}

export function defineAttributeMethodPattern(
  host: AttributeMethodHost,
  pattern: AttributeMethodPattern,
  attrName: string,
  options?: { override?: boolean },
): void {
  const methodName = pattern.methodName(attrName);
  if (host.prototype[methodName] !== undefined && !options?.override) return;
  ensureOwnGeneratedMethods(host);
  const fn = function (this: AnyRecord) {
    return this.readAttribute(attrName);
  };
  (fn as AnyRecord).__generatedAttributeMethod = true;
  Object.defineProperty(host.prototype, methodName, {
    value: fn,
    writable: true,
    configurable: true,
  });
  host._generatedMethods.add(methodName);
}

export function eagerlyGenerateAliasAttributeMethods(
  host: AttributeMethodHost,
  newName: string,
  oldName: string,
): void {
  generateAliasAttributeMethods(host, newName, oldName);
}

export function generateAliasAttributeMethods(
  host: AttributeMethodHost,
  newName: string,
  oldName: string,
): void {
  for (const pattern of host._attributeMethodPatterns) {
    aliasAttributeMethodDefinition(host, pattern, newName, oldName);
  }
}

export function aliasAttributeMethodDefinition(
  host: AttributeMethodHost,
  pattern: AttributeMethodPattern,
  newName: string,
  oldName: string,
): void {
  const methodName = pattern.methodName(newName);
  const targetName = pattern.methodName(oldName);
  ensureOwnGeneratedMethods(host);
  const fn = function (this: AnyRecord, ...args: unknown[]) {
    const target = this[targetName];
    if (typeof target === "function") {
      return target.apply(this, args);
    }
    return this.readAttribute(oldName);
  };
  (fn as AnyRecord).__generatedAttributeMethod = true;
  Object.defineProperty(host.prototype, methodName, {
    value: fn,
    writable: true,
    configurable: true,
  });
  host._generatedMethods.add(methodName);
}

export function isAttributeAlias(host: AttributeMethodHost, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(host._attributeAliases, name);
}

export function attributeAlias(host: AttributeMethodHost, name: string): string | undefined {
  return host._attributeAliases[name];
}
