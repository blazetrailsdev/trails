/**
 * Mirrors: ActiveRecord::Type::AdapterSpecificRegistry
 *
 * Also defines Registration, DecorationRegistration, and TypeConflictError.
 */
import { Type } from "@blazetrails/activemodel";

export class TypeConflictError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "TypeConflictError";
  }
}

export class Registration {
  readonly name: string;
  protected _block: (...args: unknown[]) => Type;
  readonly adapter?: string;
  protected _override?: boolean;

  constructor(
    name: string,
    block: (...args: unknown[]) => Type,
    options?: { adapter?: string; override?: boolean },
  ) {
    this.name = name;
    this._block = block;
    this.adapter = options?.adapter;
    this._override = options?.override ?? false;
  }

  call(_registry: AdapterSpecificRegistry, ..._args: unknown[]): Type {
    return this._block(..._args);
  }

  matches(typeName: string, _options?: { adapter?: string }): boolean {
    return typeName === this.name && this._matchesAdapter(_options?.adapter);
  }

  get priority(): number {
    let result = 0;
    if (this.adapter) result |= 1;
    if (this._override) result |= 2;
    return result;
  }

  compareTo(other: Registration): number {
    const myPriorityNoAdapter = this.priority & ~1;
    const otherPriorityNoAdapter = other.priority & ~1;
    if (
      myPriorityNoAdapter === otherPriorityNoAdapter &&
      ((!this._override && other.adapter) || (this.adapter && !other._override))
    ) {
      throw new TypeConflictError(
        `Type ${this.name} was registered for all adapters, but shadows a native type with the same name for ${this.adapter ?? other.adapter}`,
      );
    }
    return this.priority - other.priority;
  }

  protected _matchesAdapter(adapter?: string): boolean {
    return this.adapter === undefined || adapter === this.adapter;
  }
}

export class DecorationRegistration extends Registration {
  private _options: Record<string, unknown>;
  private _klass: new (subtype: Type) => Type;

  constructor(
    options: Record<string, unknown>,
    klass: new (subtype: Type) => Type,
    registrationOptions?: { adapter?: string },
  ) {
    super("", () => null as any, registrationOptions);
    this._options = options;
    this._klass = klass;
  }

  call(registry: AdapterSpecificRegistry, ..._args: unknown[]): Type {
    const kwargs = _args[1] as Record<string, unknown> | undefined;
    const filteredKwargs: Record<string, unknown> = {};
    if (kwargs) {
      for (const [k, v] of Object.entries(kwargs)) {
        if (!(k in this._options)) filteredKwargs[k] = v;
      }
    }
    const symbol = _args[0] as string;
    const subtype = registry.lookup(symbol, filteredKwargs);
    return new this._klass(subtype);
  }

  matches(_typeName: string, options?: { adapter?: string; [key: string]: unknown }): boolean {
    return (
      this._matchesAdapter(options?.adapter) &&
      Object.entries(this._options).every(([k, v]) => options?.[k] === v)
    );
  }

  get priority(): number {
    return super.priority | 4;
  }
}

export class AdapterSpecificRegistry {
  private _registrations: Registration[] = [];

  addModifier(
    options: Record<string, unknown>,
    klass: new (subtype: Type) => Type,
    registrationOptions?: { adapter?: string },
  ): void {
    this._registrations.push(new DecorationRegistration(options, klass, registrationOptions));
  }

  register(
    typeName: string,
    klass?: (new (...args: any[]) => Type) | null,
    options?: { adapter?: string; override?: boolean },
    block?: (...args: unknown[]) => Type,
  ): void {
    if (!block && klass == null) {
      throw new TypeError("register requires either a klass or a block");
    }
    const factory = block ?? ((_symbol: unknown, ...args: unknown[]) => new klass!(...args));
    this._registrations.push(new Registration(typeName, factory, options));
  }

  lookup(symbol: string, options?: { adapter?: string; [key: string]: unknown }): Type {
    const registration = this._findRegistration(symbol, options);
    if (registration) {
      return registration.call(this, symbol, options);
    }
    throw new Error(`Unknown type: ${String(symbol)}`);
  }

  private _findRegistration(
    symbol: string,
    options?: { adapter?: string; [key: string]: unknown },
  ): Registration | undefined {
    const matching = this._registrations.filter((r) => r.matches(symbol, options));
    if (matching.length === 0) return undefined;
    return matching.reduce((best, current) => {
      const cmp = best.compareTo(current);
      return cmp <= 0 ? current : best;
    });
  }
}
