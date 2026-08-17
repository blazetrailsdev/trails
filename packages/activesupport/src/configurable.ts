import { NameError } from "./core-ext/name-error.js";
import { InheritableOptions } from "./ordered-options.js";

/**
 * Mirrors: ActiveSupport::Configurable::Configuration (configurable.rb:14-26).
 */
export class Configuration extends InheritableOptions {
  /** Mirrors `compile_methods!` (configurable.rb:15-17). */
  compileMethods(): void {
    // `this.constructor` goes through the Proxy that stands in for Ruby's
    // `method_missing` (ordered_options.rb:49-58), which hands back a *bound*
    // function — and a bound function carries no `prototype` to define the
    // compiled readers on. The prototype's `constructor` is the same class
    // Ruby's `self.class` answers.
    const klass = Object.getPrototypeOf(this).constructor as typeof Configuration;
    klass.compileMethods(this.keys());
  }

  /**
   * Mirrors `self.compile_methods!` (configurable.rb:20-25) — compiles reader
   * methods so we don't have to go through method_missing.
   *
   * Ruby's `def #{key}; _get(...); end` is a no-argument reader, which JavaScript
   * spells as a getter: a plain value property would answer the function itself
   * where `config.bar` has to answer the value.
   */
  static compileMethods(keys: string[]): void {
    for (const key of keys.filter((m) => !(m in this.prototype))) {
      Object.defineProperty(this.prototype, key, {
        get(this: Configuration): unknown {
          return this._get(key);
        },
        configurable: true,
      });
    }
  }
}

/**
 * Mirrors: ActiveSupport::Configurable (configurable.rb:11-155).
 *
 * Ruby's `include ActiveSupport::Configurable` mixes `ClassMethods` onto the
 * singleton and `#config` onto instances; the trails idiom for that is the
 * `this`-typed functions below, assigned onto the including class (CLAUDE.md,
 * "Module mixins").
 */
export namespace Configurable {
  export interface ConfigAccessorOptions {
    instanceReader?: boolean;
    instanceWriter?: boolean;
    instanceAccessor?: boolean;
    /**
     * `default:` (configurable.rb:110). A function value stands in for Ruby's
     * `config_accessor :hair_colors do … end` block, as `mattr_accessor`'s
     * does (module-ext.ts).
     */
    default?: unknown;
  }

  /** Mirrors `Configurable::ClassMethods` (configurable.rb:28-133). */
  export namespace ClassMethods {
    /** Mirrors `config` (configurable.rb:29-36). */
    export function config(this: any): Configuration {
      // Ruby's `@_config ||=` reads a per-class ivar, which a subclass does not
      // inherit; JavaScript statics ARE inherited, so the own-property test is
      // what keeps a subclass off its parent's config — the same job Rails'
      // private `inherited` hook (configurable.rb:135-141) does.
      if (!Object.prototype.hasOwnProperty.call(this, "_config")) {
        const superclass = Object.getPrototypeOf(this);
        if (superclass != null && typeof superclass.config === "function") {
          this._config = superclass.config().inheritableCopy();
        } else {
          // create a new "anonymous" class that will host the compiled reader methods
          this._config = new (class extends Configuration {})();
        }
      }
      return this._config;
    }

    /** Mirrors `configure` (configurable.rb:38-40). */
    export function configure(this: any, block: (config: Configuration) => void): void {
      block(config.call(this));
    }

    /**
     * Mirrors `config_accessor` (configurable.rb:107-127). Ruby's `*names`
     * followed by kwargs is spelled as a trailing options object, the shape
     * `mattr_accessor` already uses in trails.
     */
    export function configAccessor(
      this: any,
      ...namesAndOptions: (string | ConfigAccessorOptions)[]
    ): void {
      const options = popConfigAccessorOptions(namesAndOptions);
      const names = namesAndOptions as string[];
      const instanceReader = options.instanceReader !== false;
      const instanceWriter = options.instanceWriter !== false;
      const instanceAccessor = options.instanceAccessor !== false;

      for (const name of names) {
        if (!/^[_A-Za-z]\w*$/.test(name)) throw new NameError("invalid config attribute name");

        // `def #{name}; config.#{name}; end` / `def #{name}=(value); config.#{name} = value; end`
        const reader = function (this: any): unknown {
          return this.config().get(name);
        };
        const writer = function (this: any, value: unknown): void {
          this.config().set(name, value);
        };

        Object.defineProperty(this, name, { get: reader, set: writer, configurable: true });

        if (instanceAccessor) {
          if (instanceReader) {
            Object.defineProperty(this.prototype, name, { get: reader, configurable: true });
          }
          if (instanceWriter) {
            Object.defineProperty(this.prototype, name, {
              ...Object.getOwnPropertyDescriptor(this.prototype, name),
              set: writer,
              configurable: true,
            });
          }
        }

        this[name] = typeof options.default === "function" ? options.default() : options.default;
      }
    }
  }

  /** Mirrors `Configurable#config` (configurable.rb:150-152). */
  export function config(this: any): Configuration {
    if (!Object.prototype.hasOwnProperty.call(this, "_config")) {
      this._config = this.constructor.config().inheritableCopy();
    }
    return this._config;
  }
}

function popConfigAccessorOptions(
  namesAndOptions: (string | Configurable.ConfigAccessorOptions)[],
): Configurable.ConfigAccessorOptions {
  const last = namesAndOptions[namesAndOptions.length - 1];
  if (typeof last === "object" && last !== null) {
    namesAndOptions.pop();
    return last;
  }
  return {};
}
