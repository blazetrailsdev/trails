/**
 * Mirrors: ActiveRecord::Type::AdapterSpecificRegistry
 *
 * Also defines Registration, DecorationRegistration, and TypeConflictError.
 */
import { NotImplementedError } from "../errors.js";
import { Type } from "@blazetrails/activemodel";

export class TypeConflictError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "TypeConflictError";
  }
}

export class Registration {
  /** @internal */
  readonly name: string;
  protected _block: (...args: unknown[]) => Type;
  /** @internal */
  readonly adapter?: string;
  protected _override: boolean | null;

  constructor(
    name: string,
    block: (...args: unknown[]) => Type,
    options?: { adapter?: string; override?: boolean },
  ) {
    this.name = name;
    this._block = block;
    this.adapter = options?.adapter;
    this._override = options?.override ?? null;
  }

  call(
    _registry: AdapterSpecificRegistry,
    symbol: string,
    options?: Record<string, unknown>,
  ): Type {
    // Strip adapter: before calling the block — mirrors Rails' Registration#call which does
    // `def call(_registry, *args, adapter: nil, **kwargs)` stripping adapter from kwargs.
    if (!options) return this._block(symbol);
    const { adapter: _adapter, ...rest } = options;
    return Object.keys(rest).length > 0 ? this._block(symbol, rest) : this._block(symbol);
  }

  matches(typeName: string, _options?: { adapter?: string }): boolean {
    return typeName === this.name && this._matchesAdapter(_options?.adapter);
  }

  get priority(): number {
    let result = 0;
    if (this.adapter) result |= 1;
    if (this._override === true) result |= 2;
    return result;
  }

  compareTo(other: Registration): number {
    const myPriorityNoAdapter = this.priority & ~1;
    const otherPriorityNoAdapter = other.priority & ~1;
    if (
      myPriorityNoAdapter === otherPriorityNoAdapter &&
      ((this._override === null && other.adapter) || (this.adapter && other._override === null))
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

  call(registry: AdapterSpecificRegistry, symbol: string, options?: Record<string, unknown>): Type {
    // Pass through options minus the decorator's own keys and adapter:.
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(options ?? {})) {
      if (k !== "adapter" && !(k in this._options)) filtered[k] = v;
    }
    const subtype = registry.lookup(
      symbol,
      Object.keys(filtered).length > 0 ? filtered : undefined,
    );
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
    throw new Error(`Unknown type :${String(symbol)}`);
  }

  private _findRegistration(
    symbol: string,
    options?: { adapter?: string; [key: string]: unknown },
  ): Registration | undefined {
    const matching = this._registrations.filter((r) => r.matches(symbol, options));
    if (matching.length === 0) return undefined;
    return matching.reduce((best, current) => {
      const cmp = best.compareTo(current);
      return cmp < 0 ? current : best;
    });
  }
}

/** @internal */
function registrations(): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::AdapterSpecificRegistry#registrations is not implemented",
  );
}

/** @internal */
function findRegistration(symbol: any, args?: any[], kwargs?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::AdapterSpecificRegistry#find_registration is not implemented",
  );
}

/** @internal */
function name(): never {
  throw new NotImplementedError("ActiveRecord::Type::Registration#name is not implemented");
}

/** @internal */
function block(): never {
  throw new NotImplementedError("ActiveRecord::Type::Registration#block is not implemented");
}

/** @internal */
function adapter(): never {
  throw new NotImplementedError("ActiveRecord::Type::Registration#adapter is not implemented");
}

/** @internal */
function override(): never {
  throw new NotImplementedError("ActiveRecord::Type::Registration#override is not implemented");
}

function priority(): never {
  throw new NotImplementedError("ActiveRecord::Type::Registration#priority is not implemented");
}

/** @internal */
function priorityExceptAdapter(): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::Registration#priority_except_adapter is not implemented",
  );
}

/** @internal */
function isMatchesAdapter(adapter?: any, opts?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::Registration#matches_adapter? is not implemented",
  );
}

/** @internal */
function isConflictsWith(other: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::Registration#conflicts_with? is not implemented",
  );
}

/** @internal */
function isSamePriorityExceptAdapter(other: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::Registration#same_priority_except_adapter? is not implemented",
  );
}

/** @internal */
function hasAdapterConflict(other: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::Registration#has_adapter_conflict? is not implemented",
  );
}

/** @internal */
function options(): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::DecorationRegistration#options is not implemented",
  );
}

/** @internal */
function klass(): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::DecorationRegistration#klass is not implemented",
  );
}

/** @internal */
function isMatchesOptions(kwargs?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Type::DecorationRegistration#matches_options? is not implemented",
  );
}
