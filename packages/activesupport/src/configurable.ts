import { NameError } from "./core-ext/name-error.js";
import { InheritableOptions } from "./ordered-options.js";

export class Configuration extends InheritableOptions {
  compileMethodsBang(): void {
    const klass = Object.getPrototypeOf(this).constructor as typeof Configuration;
    klass.compileMethodsBang(this.keys());
  }

  static compileMethodsBang(keys: string[]): void {
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

export namespace Configurable {
  export interface ConfigAccessorOptions {
    instanceReader?: boolean;
    instanceWriter?: boolean;
    instanceAccessor?: boolean;
    default?: unknown;
  }

  export namespace ClassMethods {
    export function config(this: any): Configuration {
      if (!Object.prototype.hasOwnProperty.call(this, "_config")) {
        const superclass = Object.getPrototypeOf(this);
        if (superclass != null && typeof superclass.config === "function") {
          this._config = superclass.config().inheritableCopy();
        } else {
          this._config = new (class extends Configuration {})();
        }
      }
      return this._config;
    }

    export function configure(this: any, block: (config: Configuration) => void): void {
      block(config.call(this));
    }

    export function configAccessor(
      this: any,
      ...namesAndOptions: (string | ConfigAccessorOptions)[]
    ): void {
      const last = namesAndOptions[namesAndOptions.length - 1];
      const options: ConfigAccessorOptions =
        typeof last === "object" && last !== null
          ? (namesAndOptions.pop() as ConfigAccessorOptions)
          : {};
      const names = namesAndOptions as string[];
      const instanceReader = options.instanceReader !== false;
      const instanceWriter = options.instanceWriter !== false;
      const instanceAccessor = options.instanceAccessor !== false;

      for (const name of names) {
        if (!/^[_A-Za-z]\w*$/.test(name)) throw new NameError("invalid config attribute name");

        const reader = function (this: any): unknown {
          return this.config().get(name);
        };
        const writer = function (this: any, value: unknown): void {
          this.config().set(name, value);
        };

        Object.defineProperty(this, name, { get: reader, set: writer, configurable: true });

        if (instanceAccessor) {
          if (instanceReader) {
            Object.defineProperty(this.prototype, name, {
              ...Object.getOwnPropertyDescriptor(this.prototype, name),
              get: reader,
              configurable: true,
            });
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

  export function config(this: any): Configuration {
    if (!Object.prototype.hasOwnProperty.call(this, "_config")) {
      this._config = this.constructor.config().inheritableCopy();
    }
    return this._config;
  }
}
