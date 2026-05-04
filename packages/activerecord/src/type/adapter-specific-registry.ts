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
  /** @internal */
  readonly name: string;
  /** @internal */
  protected get block(): (...args: unknown[]) => Type {
    return this._block;
  }
  /** @internal */
  readonly adapter?: string;
  /** @internal */
  protected get override(): boolean | null {
    return this._override;
  }

  protected _block: (...args: unknown[]) => Type;
  private _override: boolean | null;

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
    if (!options) return this._block(symbol);
    const { adapter: _adapter, ...rest } = options;
    return Object.keys(rest).length > 0 ? this._block(symbol, rest) : this._block(symbol);
  }

  matches(typeName: string, _options?: { adapter?: string }): boolean {
    return typeName === this.name && this.isMatchesAdapter(_options?.adapter);
  }

  get priority(): number {
    let result = 0;
    if (this.adapter) result |= 1;
    if (this._override === true) result |= 2;
    return result;
  }

  compareTo(other: Registration): number {
    if (this.isConflictsWith(other)) {
      throw new TypeConflictError(
        `Type ${this.name} was registered for all adapters, but shadows a native type with the same name for ${this.adapter ?? other.adapter}`,
      );
    }
    return this.priority - other.priority;
  }

  /** @internal */
  protected priorityExceptAdapter(): number {
    return this.priority & ~3;
  }

  /** @internal */
  protected isMatchesAdapter(adapter?: string): boolean {
    return this.adapter === undefined || adapter === this.adapter;
  }

  /** @internal */
  private isConflictsWith(other: Registration): boolean {
    return this.isSamePriorityExceptAdapter(other) && this.hasAdapterConflict(other);
  }

  /** @internal */
  private isSamePriorityExceptAdapter(other: Registration): boolean {
    return this.priorityExceptAdapter() === other.priorityExceptAdapter();
  }

  /** @internal */
  private hasAdapterConflict(other: Registration): boolean {
    return (
      (this._override === null && other.adapter !== undefined) ||
      (this.adapter !== undefined && other._override === null)
    );
  }
}

export class DecorationRegistration extends Registration {
  /** @internal */
  private get options(): Record<string, unknown> {
    return this._options;
  }
  /** @internal */
  private get klass(): new (subtype: Type) => Type {
    return this._klass;
  }

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
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(options ?? {})) {
      if (!(k in this._options)) filtered[k] = v;
    }
    const subtype = registry.lookup(
      symbol,
      Object.keys(filtered).length > 0 ? filtered : undefined,
    );
    return new this._klass(subtype);
  }

  matches(_typeName: string, options?: { adapter?: string; [key: string]: unknown }): boolean {
    return this.isMatchesAdapter(options?.adapter) && this.isMatchesOptions(options);
  }

  get priority(): number {
    return super.priority | 4;
  }

  /** @internal */
  private isMatchesOptions(kwargs?: Record<string, unknown>): boolean {
    return Object.entries(this._options).every(([k, v]) => kwargs?.[k] === v);
  }
}

export class AdapterSpecificRegistry {
  private _registrations: Registration[] = [];

  /** @internal */
  private get registrations(): Registration[] {
    return this._registrations;
  }

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
    const registration = this.findRegistration(symbol, options);
    if (registration) {
      return registration.call(this, symbol, options);
    }
    throw new Error(`Unknown type :${String(symbol)}`);
  }

  /** @internal */
  private findRegistration(
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
