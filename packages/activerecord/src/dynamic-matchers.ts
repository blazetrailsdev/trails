import { camelize, underscore } from "@blazetrails/activesupport";
import { NoMethodError, NotImplementedError } from "@blazetrails/ruby-compat";
import { ActiveRecord } from "./namespaces.js";

interface DynamicMatchersHost {
  name: string;
  columnsHash(): Record<string, unknown>;
  attributeAliases?: Record<string, string>;
  reflectOnAggregation?(aggregation: string): unknown;
}

export function respondToMissing(this: DynamicMatchersHost, name: string): boolean {
  if ((this as unknown) === ActiveRecord.Base) {
    return false;
  } else {
    const match = Method.match(this, name);
    return (match !== null && match.isValid()) || false;
  }
}

export function methodMissing(
  this: DynamicMatchersHost,
  name: string,
  ...args: unknown[]
): unknown {
  const match = Method.match(this, name);

  if (match !== null && match.isValid()) {
    match.define();
    return (this as unknown as Record<string, (...args: unknown[]) => unknown>)[name](...args);
  } else {
    throw new NoMethodError(`undefined method '${name}' for class ${this.name}`);
  }
}

abstract class Method {
  static matchers: (typeof FindBy | typeof FindByBang)[] = [];

  static match(model: DynamicMatchersHost, name: string): Method | null {
    const klass = this.matchers.find((k) => k.pattern().test(name));
    return klass ? new klass(model, name) : null;
  }

  private static _pattern?: RegExp;

  static pattern(): RegExp {
    if (!Object.prototype.hasOwnProperty.call(this, "_pattern")) {
      this._pattern = new RegExp(`^${this.prefix()}([_a-zA-Z]\\w*(?<!Bang))${this.suffix()}$`);
    }
    return this._pattern!;
  }

  static prefix(): string {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError();
  }

  static suffix(): string {
    return "";
  }

  readonly model: DynamicMatchersHost;
  readonly name: string;
  readonly attributeNames: string[];

  constructor(model: DynamicMatchersHost, methodName: string) {
    this.model = model;
    this.name = methodName;
    this.attributeNames = underscore(
      this.name.match((this.constructor as typeof Method).pattern())![1],
    ).split("_and_");
    this.attributeNames = this.attributeNames.map(
      (name) => this.model.attributeAliases?.[name] ?? name,
    );
  }

  isValid(): boolean {
    const columnsHash = this.model.columnsHash();
    return this.attributeNames.every(
      (name) =>
        columnsHash[name] != null ||
        this.model.reflectOnAggregation?.(camelize(name, false)) != null,
    );
  }

  define(): void {
    const method = this;
    Object.defineProperty(this.model, this.name, {
      value: function (
        this: Record<string, (hash: Record<string, unknown>) => unknown>,
        ...args: unknown[]
      ) {
        return this[method.finder()](method.attributesHash(args));
      },
      writable: true,
      configurable: true,
    });
  }

  /** @internal */
  private attributesHash(args: unknown[]): Record<string, unknown> {
    return Object.fromEntries(this.attributeNames.map((name, i) => [name, args[i]]));
  }

  /** @internal */
  protected abstract finder(): string;
}

class FindBy extends Method {
  static prefix(): string {
    return "findBy";
  }

  protected finder(): string {
    return "findBy";
  }
}
Method.matchers.push(FindBy);

class FindByBang extends Method {
  static prefix(): string {
    return "findBy";
  }

  static suffix(): string {
    return "Bang";
  }

  protected finder(): string {
    return "findByBang";
  }
}
Method.matchers.push(FindByBang);
