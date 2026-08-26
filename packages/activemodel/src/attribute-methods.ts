/**
 * AttributeMethods module — dynamic attribute method generation.
 *
 * Mirrors: ActiveModel::AttributeMethods
 *
 * In Rails, this module's ClassMethods are mixed into the class via `include`.
 * In TS the two halves are the exported {@link ClassMethods} and
 * {@link InstanceMethods} module objects, whose `this`-typed methods
 * `extend()` / `include()` mix onto a host class (see the bottom of model.ts)
 * — no delegation wrappers needed.
 */
import {
  camelize,
  classAttribute,
  CodeGenerator,
  include,
  included,
  type Extended,
  type Included,
  Module,
  NameError,
} from "@blazetrails/activesupport";

export interface AttributeMethods {
  attributeMissing(match: AttributeMethod, ...args: unknown[]): unknown;
  respondTo(method: string): boolean;
}

/**
 * Rails threads `__FILE__, __LINE__` into every `CodeGenerator.batch` so the
 * `module_eval` it performs reports a real source location. The port defines
 * methods directly instead of evaluating source, so the pair is inert — it is
 * still passed, under the Ruby names, because `batch`'s signature is Rails'
 * (code_generator.rb:39).
 */
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

/** Mirrors: `AttributeMethodPattern::AttributeMethod = Struct.new(:proxy_target, :attr_name)` */
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

  /**
   * Ruby joins `"#{prefix}#{attr_name}#{suffix}"` over snake_case affixes
   * (attribute_methods.rb:552); trails' affixes are the camelCased halves of
   * the same names, so the join capitalizes what follows a prefix — Ruby
   * `saved_change_to_` + `name` is `savedChangeTo` + `Name`. With no prefix the
   * two joins are identical, which is why the bare and suffix-only patterns
   * already in the tree are unaffected.
   *
   * A Ruby bang suffix (`restore_name!`, `name_will_change!`,
   * dirty.rb:242,244) is kept in the declaration and stripped here: it names a
   * mutator, not a reader, so its `parameters: false` becomes an empty
   * parameter list — a zero-arg METHOD — rather than the accessor property
   * `defineCall` gives a zero-arg reader (CLAUDE.md, "Generated attribute
   * readers are properties"). The bang survives in `proxy_target`, spelled
   * `Bang` — Ruby dispatches `name_will_change!` to `attribute_will_change!`
   * and `restore_name!` to `restore_attribute!` (dirty.rb:409,414), both bang
   * methods.
   */
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

  /**
   * Whether this pattern's prefix is a camelCased half of the generated name
   * rather than a literal Ruby fragment. A snake_case prefix carries its own
   * separator (`clear_`), so it joins verbatim as Ruby does.
   */
  private get camelJoined(): boolean {
    return this.prefix !== "" && !this.prefix.endsWith("_");
  }
}

/** Minimum shape required of an instance accessed through a generated attribute method closure. */
interface ReadWriteHost {
  /** @internal */
  _readAttribute(attr: string): unknown;
  /** @internal */
  _writeAttribute(name: string, value: unknown): void;
  [key: string]: unknown;
}

/**
 * Ruby's `NoMethodError`, which `__send__` raises for an undefined name and
 * `method_missing`'s `else super` arm re-raises (attribute_methods.rb:507-514).
 * It subclasses `NameError` because Ruby's does (`NoMethodError < NameError`).
 * Local to this module, as in activesupport's `method-missing-proxy.ts`: the
 * raise site is here and callers identify it by `name` and message.
 */
class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

/**
 * The per-class state `ActiveModel::AttributeMethods` keeps — the two
 * `class_attribute`s its `included do` block declares (attribute_methods.rb:70-73)
 * and the ivars its ClassMethods bodies memoize into.
 */
export interface AttributeMethodHost {
  attributeNames(): string[];
  attributeMethodPatterns: AttributeMethodPattern[];
  /** @internal Stamps read by {@link _resurrectAttributeMethods}. */
  _patternsGeneratedFor?: Map<string, AttributeMethodPattern[]>;
  /** @internal Stamp read by {@link _resurrectAttributeMethods}. */
  _patternsAtLastResurrection?: AttributeMethodPattern[];
  attributeAliases: Record<string, string>;
  _aliasesByAttributeName: Map<string, string[]>;
  _generatedAttributeMethods?: Module;
}

/**
 * A host class with {@link ClassMethods} (attribute_methods.rb:75-501) extended
 * onto it — the `extend(Model, …)` at the bottom of model.ts. Ruby reaches these
 * by self-send from one ClassMethods body to the next; deriving the shape from
 * the module object is what lets the ported bodies do the same, with no parallel
 * list of signatures to keep in step.
 *
 * Deliberately NOT exported: a declaration carrying Rails method names but no
 * bodies outranks the file's real bodies when api-compare pairs a Ruby method
 * against this file (RFC 0025,
 * `api-compare-bodyless-declaration-outranks-real-body`), which would stop the
 * bodies below being measured for call parity.
 */
interface ClassMethodsHost extends AttributeMethodHost, Extended<typeof ClassMethods> {}

/** The state the module's own instance methods (attribute_methods.rb:504-590) read. */
export interface InstanceHost {
  _attributes?: { isKey(name: string): boolean };
  attributes: Record<string, unknown>;
  attributeMethodPatterns?: AttributeMethodPattern[];
  constructor: AttributeMethodHost;
}

/**
 * A record with {@link InstanceMethods} included — the `include(Model, …)` at
 * the bottom of model.ts. Unexported for the same reason as
 * {@link ClassMethodsHost}.
 */
interface InstanceMethodsHost extends InstanceHost, Included<typeof InstanceMethods> {
  constructor: ClassMethodsHost;
}

const NAME_COMPILABLE_REGEXP = /^[a-zA-Z_]\w*[!?=]?$/;

/**
 * Mirrors: ActiveModel::AttributeMethods::ClassMethods (attribute_methods.rb:75-501),
 * mixed onto a host class by the `extend(Model, ClassMethods)` in model.ts.
 */
export const ClassMethods = {
  /**
   * Mirrors Rails' `attribute_method_prefix(*prefixes, parameters: nil)`
   * (attribute_methods.rb:106-109). TS forbids a keyword after a rest element, so
   * the trailing `parameters:` hash rides in the splat and is peeled off — the
   * same shape `touch(*names, time:)` uses in `activerecord/timestamp.ts`.
   */
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

  /** Mirrors: ClassMethods#attribute_method_suffix (attribute_methods.rb:140-143). */
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

  /** Mirrors: ClassMethods#attribute_method_affix (attribute_methods.rb:175-178). */
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

  /**
   * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#alias_attribute_method_definition
   * (activerecord/attribute_methods.rb:87-96) — the alias is generated by the
   * same pattern path as a regular attribute method, under the alias' name and
   * with the override arm on.
   */
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

  /**
   * Ruby defaults the `_owner:` kwarg to `generated_attribute_methods`
   * (attribute_methods.rb:311), a self-send. A `this`-typed default in the
   * parameter list makes the module object's own type circular through
   * {@link ClassMethodsHost}, which TS cannot infer, so the default is
   * spelled where TS can see it — same value, same self-send, one line later.
   */
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

  /**
   * Mirrors: ClassMethods#define_attribute_method_pattern
   *
   * Rails' only `override: true` caller is `alias_attribute_method_definition`
   * (activerecord/attribute_methods.rb:94), and so is trails'.
   *
   * `"define_method_#{pattern.proxy_target}"` (attribute_methods.rb:333) is
   * spelled out rather than interpolated: a proxy target ending in `=` names a
   * Ruby writer, whose bare camel spelling belongs to the reader hook of the same
   * name, so it takes the `set*` fallback docs/ruby-ts-conventions.md gives a
   * `name=` writer.
   */
  defineAttributeMethodPattern(
    this: ClassMethodsHost,
    pattern: AttributeMethodPattern,
    attrName: string,
    { owner, as, override = false }: { owner: CodeGenerator; as: string; override?: boolean },
  ): void {
    const canonicalMethodName = pattern.methodName(attrName);
    const publicMethodName = pattern.methodName(as);

    // If defining a regular attribute method, we don't override methods that are
    // explicitly defined in parent classes (attribute_methods.rb:326). The
    // predicate is a template method: Ruby dispatches it through the class, and
    // ActiveRecord overrides it to raise DangerousAttributeError for a name
    // Active Record itself defines and to consult the class's own methods
    // (activerecord/attribute_methods.rb:165-179).
    if (this.isInstanceMethodAlreadyImplemented(publicMethodName)) {
      if (!override) return;
    }

    // A `parameters: false` pattern emits an accessor property, and a property
    // cannot shadow an inherited method without breaking every caller that
    // invokes it — the third consequence in CLAUDE.md, "Generated attribute
    // readers are properties". Rails needs no such check: `id_in_database` stays
    // a method whether it comes from PrimaryKey or from the `_in_database`
    // suffix, so a pk-less model (a PostgreSQL foreign table) generating over it
    // is harmless there and is not there.
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
    // Clear the pattern-match cache so stale entries don't survive after patterns change.
    // Mirrors: Rails attribute_method_patterns_cache.clear in undefine_attribute_methods.
    // Only clear an own-property cache; don't reach up and clear a parent's cache
    // via inherited prototype-chain lookup.
    if (Object.hasOwn(this, "_attributeMethodPatternsCache")) {
      (
        this as ClassMethodsHost & { _attributeMethodPatternsCache: Map<unknown, unknown> }
      )._attributeMethodPatternsCache.clear();
    }
  },

  /**
   * Mirrors: ClassMethods#aliases_by_attribute_name
   * (`activemodel/lib/active_model/attribute_methods.rb:382-384`), a plain
   * per-class ivar. Rails' `inherited` hook resets it on every subclass
   * (`:387-394`), so a subclass starts empty; JS has no such hook (CLAUDE.md,
   * "Module mixins"), and the own-property check is the port of that reset.
   */
  aliasesByAttributeName(this: ClassMethodsHost): Map<string, string[]> {
    if (!Object.prototype.hasOwnProperty.call(this, "_aliasesByAttributeName")) {
      this._aliasesByAttributeName = new Map<string, string[]>();
    }
    return this._aliasesByAttributeName;
  },

  /** @internal Rails-private helper. Mirrors: ClassMethods#resolve_attribute_name */
  resolveAttributeName(this: ClassMethodsHost, name: string): string {
    return this.attributeAliases?.[name] ?? name;
  },

  /**
   * @internal Rails-private helper. Mirrors: ClassMethods#generated_attribute_methods
   *
   *   def generated_attribute_methods
   *     @generated_attribute_methods ||= Module.new.tap { |mod| include mod }
   *   end
   *
   * (attribute_methods.rb:400-402.) The `||=` is on a per-class ivar, so the
   * memo is checked as an *own* property: a subclass must build and include its
   * own module rather than reusing the one it inherits from its parent, which is
   * what Ruby's per-class ivar (reset in `inherited`, attribute_methods.rb:386-393)
   * gives for free.
   */
  generatedAttributeMethods(this: ClassMethodsHost): Module {
    if (!Object.hasOwn(this, "_generatedAttributeMethods")) {
      const mod = new Module();
      include(this as unknown as new (...args: unknown[]) => unknown, mod);
      this._generatedAttributeMethods = mod;
    }
    return this._generatedAttributeMethods!;
  },

  /** @internal Rails-private helper. Mirrors: ClassMethods#instance_method_already_implemented? */
  isInstanceMethodAlreadyImplemented(this: ClassMethodsHost, methodName: string): boolean {
    return this.generatedAttributeMethods().isMethodDefined(methodName);
  },

  /**
   * @internal Rails-private helper. Mirrors: ClassMethods#attribute_method_patterns_cache
   *
   * @missingRailsArgs new — PERMANENT: attribute_methods.rb:418 writes
   * `Concurrent::Map.new(initial_capacity: 4)`; a JS `Map` has no capacity hint,
   * so the kwarg has no counterpart to pass.
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

  /** @internal Rails-private helper. Mirrors: ClassMethods#attribute_method_patterns_matching */
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

  /**
   * @internal Rails-private helper. Mirrors: ClassMethods#define_proxy_call
   *
   * Ruby's `(code_generator, name, proxy_target, parameters, *call_args,
   * namespace:, as:)` puts required keywords after a splat, which TS cannot
   * express: the kwargs travel as the last element of the rest tuple.
   *
   * Two steps of attribute_methods.rb:408-424 have no TS analogue and are
   * dropped rather than emulated: `call_args.map!(&:inspect)` quotes each
   * argument for the Ruby source string, where the port passes the values
   * themselves, and `call_args << parameters if parameters` appends the
   * forwarding signature, which `defineCall`'s rest parameter already does.
   */
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

  /**
   * @internal Rails-private helper. Mirrors: ClassMethods#build_mangled_name
   * Returns a compilable temp name for attributes with non-identifier characters.
   */
  buildMangledName(name: string): string {
    if (NAME_COMPILABLE_REGEXP.test(name)) return name;
    const hex = Array.from(name)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    return `__temp__${hex}`;
  },

  /**
   * @internal Rails-private helper. Mirrors: ClassMethods#define_call
   *
   * Rails compiles `def mangled_name(params); self.target_name(call_args); end`
   * into the generator's batch. A TS "source" is the definition itself, so the
   * emitted body is the equivalent closure over `callArgs`; a rest parameter
   * forwards what Ruby's `params` names, so `parameters` only matters when it is
   * `false` — `def #{mangled_name}(#{parameters || ''})` (attribute_methods.rb:465)
   * is then a zero-arg reader, which is an accessor property in TS (CLAUDE.md,
   * "Generated attribute readers are properties"). A `parameters: false` pattern
   * (before_type_cast.rb:32, query.rb:10) is NOT nil, so it survives as `false`.
   * `CALL_COMPILABLE_REGEXP` has no analogue either: a JS property lookup needs
   * no name to be compilable, so the `send(...)` arm it guards never applies.
   * `name` is unused here exactly as it is in Ruby.
   */
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

/**
 * The instance half of `ActiveModel::AttributeMethods`
 * (attribute_methods.rb:504-590), plus the module's `included do` block
 * (attribute_methods.rb:70-73):
 *
 *   included do
 *     class_attribute :attribute_aliases, instance_writer: false, default: {}
 *     class_attribute :attribute_method_patterns, instance_writer: false,
 *       default: [ ClassMethods::AttributeMethodPattern.new ]
 *   end
 */
export const InstanceMethods = {
  [included](base: object): void {
    classAttribute.call(base, "attributeAliases", { instanceWriter: false, default: {} });
    classAttribute.call(base, "attributeMethodPatterns", {
      instanceWriter: false,
      default: [new AttributeMethodPattern()],
    });
  },

  /**
   * attribute_missing — generic dispatch for an attribute method recognized
   * through Rails' method_missing path (`matched_attribute_method`), as opposed
   * to one `define_attribute_method_pattern` has already generated: a generated
   * method sends its proxy target directly.
   *
   * Mirrors: attribute_methods.rb:520-522
   *   def attribute_missing(match, ...)
   *     __send__(match.proxy_target, match.attr_name, ...)
   *   end
   */
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

  /**
   * Mirrors: #respond_to_without_attributes? — the alias Rails captures for the
   * original `respond_to?` before overriding it (attribute_methods.rb:527-528,
   * `alias :respond_to_without_attributes? :respond_to?`). It keeps the
   * `respond_to?(method, include_private_methods = false)` signature and answers
   * whether the receiver responds to `method` at all — including attribute
   * accessors exposed as getter/setter properties, not just plain functions. The
   * `in` check mirrors Ruby `respond_to?` across the prototype chain.
   *
   * Rails' `include_private_methods` parameter is dropped: a JS receiver has no
   * string-named private methods for it to reveal, so it could never change the
   * answer. See {@link respondTo} for the branch that drops with it.
   */
  isRespondToWithoutAttributes(this: object, method: string): boolean {
    return method in (this as Record<string, unknown>);
  },

  /**
   * Mirrors: attribute_methods.rb:528-539
   *
   *   def respond_to?(method, include_private_methods = false)
   *     if super
   *       true
   *     elsif !include_private_methods && super(method, true)
   *       false
   *     else
   *       !matched_attribute_method(method.to_s).nil?
   *     end
   *   end
   *
   * Ruby's `super` here is the aliased original, which trails names
   * {@link isRespondToWithoutAttributes} — TS has no `super` for a module
   * outside the prototype chain, so the `super` send is spelled as a send to
   * that alias, in the same position.
   *
   * @missingRailsCall super — PERMANENT: the middle arm (`elsif !include_private_methods
   * && super(method, true)`, attribute_methods.rb:531-535) is omitted. It answers
   * `false` for a name that exists ONLY as a Ruby-private method; a JS receiver
   * has no string-named private methods, so `super(method, true)` and `super`
   * always agree and the arm can never be taken. Porting it means porting a
   * branch that reads as live and cannot run. `includePrivateMethods` stays in
   * the signature — it is what Rails' callers pass — but no longer selects
   * anything.
   */
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

  /**
   * @internal Rails-private helper. Mirrors: #attribute_method?
   * (attribute_methods.rb:541-543) —
   * `respond_to_without_attributes?(:attributes) && attributes.include?(attr_name)`.
   * Ruby `Hash#include?` is key existence, so the second call is `Object.hasOwn`
   * over the hash `attributes` returns.
   */
  isAttributeMethod(this: InstanceMethodsHost, attrName: string): boolean {
    return (
      this.isRespondToWithoutAttributes("attributes") && Object.hasOwn(this.attributes, attrName)
    );
  },

  /** @internal Rails-private helper. Mirrors: #matched_attribute_method */
  matchedAttributeMethod(this: InstanceMethodsHost, methodName: string): AttributeMethod | null {
    const matches = this.constructor.attributeMethodPatternsMatching(methodName);
    return matches.find((m) => this.isAttributeMethod(m.attrName)) ?? null;
  },

  /**
   * @internal Rails-private helper. Mirrors: #missing_attribute
   * Rails passes `stack` (a `caller` backtrace) so `raise` reports the call site
   * rather than this helper; JS `Error` captures its own stack, so when a `stack`
   * string is supplied we overwrite the error's stack to match Rails' intent.
   */
  missingAttribute(this: InstanceHost, attrName: string, stack?: string): never {
    const err = new MissingAttributeError(
      `missing attribute '${attrName}' for ${(this.constructor as { name?: string }).name ?? "unknown"}`,
    );
    if (stack !== undefined) err.stack = stack;
    throw err;
  },

  /**
   * Mirrors: attribute_methods.rb:555-558
   *   private
   *     def _read_attribute(attr)
   *       __send__(attr)
   *     end
   *
   * ActiveModel dispatches through the reader method; only ActiveRecord's
   * override goes to the attribute set (activerecord/attribute_methods/read.rb:
   * 35-37). A generated reader is an accessor property in trails (CLAUDE.md
   * § "Generated attribute readers are properties"), so `__send__(attr)` is a
   * property read rather than a call.
   *
   * A name the receiver does not answer is where Ruby's `__send__` raises
   * `NoMethodError` and `method_missing` (attribute_methods.rb:507-514) takes
   * over: a `matched_attribute_method` goes to `attribute_missing`, and anything
   * else falls to `super` and propagates. JS has no `method_missing`, so a bare
   * property read would answer `undefined` there instead — the cascade is spelled
   * out here.
   *
   * @internal Rails-private helper.
   */
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

/**
 * The `send(proxy_target, *call_args)` the generated body performs
 * (attribute_methods.rb:465). A proxy target the receiver does not answer falls
 * to Ruby's `method_missing`, and `AttributeMethods#method_missing`
 * (attribute_methods.rb:504-518) hands a matched name to `attribute_missing` —
 * the hook a class overrides to intercept a whole pattern. JS has no
 * `method_missing`, so the fallback is spelled here instead.
 */
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

/**
 * Whether a class body — as opposed to a generated attribute-methods module —
 * answers `name` anywhere up the chain. `include()` splices a module's carrier
 * directly below the including class's prototype, and a carrier has no own
 * `constructor`, which is what tells the two apart; that is the JS spelling of
 * Rails' `!superclass.instance_method(name).owner.is_a?(GeneratedAttributeMethods)`
 * (activerecord/attribute_methods.rb:170-176).
 *
 * @noRailsEquivalent PERMANENT. The shadowing consequence of the repo-wide
 * "generated attribute readers are properties" rule (CLAUDE.md, "Generated
 * attribute readers are properties"); see there rather than re-deriving it.
 * Pinned by "attribute named toJSON does not shadow Model#toJSON". ActiveRecord
 * needs none of this: its `instance_method_already_implemented?` override
 * (attribute_methods.rb:165-179) rejects such a name before the hook runs.
 */
/**
 * Whether `name` resolves to a plain method on the class — as opposed to a
 * generated accessor property, or nothing. The JS spelling of Rails'
 * `!owner.is_a?(GeneratedAttributeMethods)` test over a name that is already
 * defined (activerecord/attribute_methods.rb:174-176), narrowed to the one
 * case where the distinction bites: replacing a method with a property.
 *
 * @noRailsEquivalent PERMANENT. See `defineAttributeMethodPattern`'s call site
 * and CLAUDE.md, "Generated attribute readers are properties".
 */
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

/**
 * @noRailsEquivalent PERMANENT. ActiveModel has no `define_method_attribute`:
 * for a plain `ActiveModel::Attributes` includer,
 * `respond_to?("define_method_attribute", true)` is false, so the bare pattern
 * takes the `else` branch of attribute_methods.rb:333-346 and
 * `define_proxy_call` generates the ordinary method
 * `def name; attribute("name"); end`, dispatching to the private instance
 * method `attribute(attr_name)` (attributes.rb:161). Only ActiveRecord defines
 * the hook (attribute_methods/read.rb:11). trails needs it in ActiveModel too,
 * and this descriptor carries the `set` half as well — both are consequences of
 * the repo-wide "generated attribute readers are properties" rule (CLAUDE.md,
 * "Generated attribute readers are properties"), which is where that decision
 * is ratified; it is not re-argued here.
 */
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
 * The trails stand-in for the resurrection Rails gets from `method_missing`
 * (attribute_methods.rb:507-514): the three macros end at
 * `undefine_attribute_methods` (attribute_methods.rb:120-123, 140-143,
 * 175-178) and Rails re-matches the newly added pattern at call time, so a
 * pattern declared after the attributes still answers. trails generates them as
 * accessor properties instead — see CLAUDE.md, "Generated attribute readers are
 * properties" — and a property cannot be created by a `method_missing`-shaped
 * hook, so it must exist before the first read; the earliest such moment is
 * instantiation, where {@link Model}'s constructor calls this. Regenerating
 * only names whose stamp predates the current
 * `attribute_method_patterns` is what confines it to the macro case: a bare
 * `undefine_attribute_methods` leaves the patterns alone and stays undone, and
 * a class that has generated nothing keeps its own first-generation seat.
 */
export function _resurrectAttributeMethods(klass: ClassMethodsHost): void {
  const patterns = klass.attributeMethodPatterns;
  if (klass._patternsAtLastResurrection === patterns) return;
  klass._patternsAtLastResurrection = patterns;
  const stale = [...(klass._patternsGeneratedFor ?? [])]
    .filter(([, generatedWith]) => generatedWith !== patterns)
    .map(([attrName]) => attrName);
  if (stale.length > 0) klass.defineAttributeMethods(...stale);
}
