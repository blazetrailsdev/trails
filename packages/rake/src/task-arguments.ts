import { fetch, KERNEL_METHODS, PROTOCOL_PROBES, rbModName } from "@blazetrails/ruby-compat";

export class TaskArguments {
  readonly names: string[];
  private _parent: TaskArguments | null;
  private _hash: Record<string, unknown>;
  private _values: unknown[];

  [name: string]: unknown;

  constructor(names: string[], values: unknown[], parent: TaskArguments | null = null) {
    this.names = names;
    this._parent = parent;
    this._hash = {};
    this._values = values;
    names.forEach((name, i) => {
      if (values[i] == null || values[i] === "") return;
      this._hash[String(name)] = values[i];
    });
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (
          typeof prop === "symbol" ||
          prop in target ||
          PROTOCOL_PROBES.has(prop) ||
          KERNEL_METHODS.has(prop)
        ) {
          return Reflect.get(target, prop, receiver);
        }
        return target.methodMissing(prop);
      },
    });
  }

  toA(): unknown[] {
    return [...this._values];
  }

  extras(): unknown[] {
    return this._values.slice(this.names.length);
  }

  newScope(names: string[]): TaskArguments {
    const values = names.map((n) => this.get(n));
    return new (this.constructor as typeof TaskArguments)(
      names,
      [...values, ...this.extras()],
      this,
    );
  }

  get(index: string): unknown {
    return this.lookup(String(index));
  }

  withDefaults(defaults: Record<string, unknown>): Record<string, unknown> {
    return (this._hash = { ...defaults, ...this._hash });
  }

  each(block: (pair: [string, unknown]) => void): Record<string, unknown> {
    for (const pair of Object.entries(this._hash)) block(pair);
    return this._hash;
  }

  valuesAt(...keys: string[]): unknown[] {
    return keys.map((k) => this.lookup(k));
  }

  methodMissing(sym: string, ..._args: unknown[]): unknown {
    return this.lookup(String(sym));
  }

  toHash(): Record<string, unknown> {
    return { ...this._hash };
  }

  toString(): string {
    return this.inspect();
  }

  inspect(): string {
    const inspection = Object.entries(this._hash)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
    return `#<${rbModName(this.constructor)} ${inspection}>`;
  }

  hasKey(key: string): boolean {
    return Object.hasOwn(this._hash, key);
  }

  isKey(key: string): boolean {
    return this.hasKey(key);
  }

  fetch(...args: [key: string, ...rest: unknown[]]): unknown {
    return (fetch as (h: object, ...a: unknown[]) => unknown)(this._hash, ...args);
  }

  /** @internal */
  protected lookup(name: string): unknown {
    if (Object.hasOwn(this._hash, name)) {
      return this._hash[name];
    } else if (this._parent) {
      return this._parent.lookup(name);
    }
    return null;
  }
}

export const EMPTY_TASK_ARGS = new TaskArguments([], []);
