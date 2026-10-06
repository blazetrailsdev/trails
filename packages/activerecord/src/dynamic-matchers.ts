import { camelize, underscore } from "@blazetrails/activesupport";
import {
  ArgumentError,
  NoMethodError,
  NotImplementedError,
  rbFSend,
} from "@blazetrails/ruby-compat";
import { ActiveRecord } from "./namespaces.js";

interface DynamicMatchersHost {
  name: string;
  columnsHash(): Record<string, unknown>;
  attributeAliases: Record<string, string>;
  reflectOnAggregation(aggregation: string): unknown;
}

export function respondToMissing(this: DynamicMatchersHost, name: string, _: boolean): boolean {
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
    return rbFSend(this, name, ...args);
  } else {
    throw new NoMethodError(`undefined method '${name}' for class ${this.name}`);
  }
}

export class Method {
  static matchers: (typeof Method)[] = [];

  static match(model: DynamicMatchersHost, name: string): Method | null {
    const klass = this.matchers.find((k) => k.pattern().test(name));
    return klass ? new klass(model, name) : null;
  }

  private static _pattern?: RegExp;

  static pattern(): RegExp {
    if (!Object.prototype.hasOwnProperty.call(this, "_pattern")) {
      this._pattern = new RegExp(
        `^${this.prefix()}([_a-zA-Z]\\w*)${this.suffix() || "(?<!Bang)"}$`,
      );
    }
    return this._pattern!;
  }

  static prefix(): string {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/dynamic_matchers.rb:42
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
      (name) => this.model.attributeAliases[name] || name,
    );
  }

  isValid(): boolean {
    return this.attributeNames.every(
      (name) =>
        this.model.columnsHash()[name] != null ||
        this.model.reflectOnAggregation(camelize(name, false)) != null,
    );
  }

  define(): void {
    const arity = this.attributeNames.length;
    Object.defineProperty(this.model, this.name, {
      value: new Function(
        "ArgumentError",
        `return function (${this.signature()}) {
          if (arguments.length !== ${arity}) {
            throw new ArgumentError(
              "wrong number of arguments (given " + arguments.length + ", expected ${arity})",
            );
          }
          return this.${this.body()};
        };`,
      )(ArgumentError),
      writable: true,
      configurable: true,
    });
  }

  /** @internal */
  private body(): string {
    return `${this.finder()}(${this.attributesHash()})`;
  }

  /** @internal */
  private signature(): string {
    return this.attributeNames.map((name) => `_${name}`).join(", ");
  }

  /** @internal */
  private attributesHash(): string {
    return "{" + this.attributeNames.map((name) => `${name}: _${name}`).join(",") + "}";
  }

  protected finder(): string {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/dynamic_matchers.rb:91
    throw new NotImplementedError();
  }
}

export class FindBy extends Method {
  static prefix(): string {
    return "findBy";
  }

  finder(): string {
    return "findBy";
  }
}
Method.matchers.push(FindBy);

export class FindByBang extends Method {
  static prefix(): string {
    return "findBy";
  }

  static suffix(): string {
    return "Bang";
  }

  finder(): string {
    return "findByBang";
  }
}
Method.matchers.push(FindByBang);
