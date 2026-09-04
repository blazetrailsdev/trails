import { ArgumentError, Type } from "@blazetrails/activemodel";

export class TypeConflictError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "TypeConflictError";
  }
}

function splitKwargs(
  argsAndKwargs: readonly unknown[],
): [unknown[], Record<string, unknown> | undefined] {
  const args = [...argsAndKwargs];
  const last = args[args.length - 1];
  if (
    last !== null &&
    typeof last === "object" &&
    !Array.isArray(last) &&
    Object.getPrototypeOf(last) === Object.prototype
  ) {
    return [args.slice(0, -1), args[args.length - 1] as Record<string, unknown>];
  }
  return [args, undefined];
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

  call(_registry: AdapterSpecificRegistry, ...argsAndKwargs: unknown[]): Type {
    const [args, kwargs] = splitKwargs(argsAndKwargs);
    if (!kwargs) return this._block(...args);
    const { adapter: _adapter, ...rest } = kwargs;
    return Object.keys(rest).length > 0 ? this._block(...args, rest) : this._block(...args);
  }

  matches(typeName: string, ...argsAndKwargs: unknown[]): boolean {
    const [, kwargs] = splitKwargs(argsAndKwargs);
    return typeName === this.name && this.isMatchesAdapter(kwargs);
  }

  /** @internal */
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
  protected isMatchesAdapter(options?: { adapter?: string }): boolean {
    return this.adapter === undefined || options?.adapter === this.adapter;
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

  override call(registry: AdapterSpecificRegistry, ...argsAndKwargs: unknown[]): Type {
    const [args, kwargs] = splitKwargs(argsAndKwargs);
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(kwargs ?? {})) {
      if (!(k in this._options)) filtered[k] = v;
    }
    const subtype = registry.lookup(
      ...(args as [string, ...unknown[]]),
      ...(Object.keys(filtered).length > 0 ? [filtered] : []),
    );
    return new this._klass(subtype);
  }

  override matches(_typeName: string, ...argsAndKwargs: unknown[]): boolean {
    const [, kwargs] = splitKwargs(argsAndKwargs);
    return this.isMatchesAdapter(kwargs) && this.isMatchesOptions(kwargs);
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
    args?: { adapter?: string },
  ): void {
    this.registrations.push(new DecorationRegistration(options, klass, args));
  }

  register(
    typeName: string,
    klass?: (new (...args: any[]) => Type) | null,
    options?: { adapter?: string; override?: boolean },
    block?: (...args: unknown[]) => Type,
  ): void {
    const factory = block ?? ((_symbol: unknown, ...args: unknown[]) => new klass!(...args));
    this.registrations.push(new Registration(typeName, factory, options));
  }

  lookup(symbol: string, ...args: unknown[]): Type {
    const registration = this.findRegistration(symbol, ...args);
    if (registration) {
      return registration.call(this, symbol, ...args);
    }
    throw new ArgumentError(`Unknown type :${String(symbol)}`);
  }

  /** @internal */
  private findRegistration(symbol: string, ...args: unknown[]): Registration | undefined {
    const matching = this.registrations.filter((r) => r.matches(symbol, ...args));
    if (matching.length === 0) return undefined;
    return matching.reduce((best, current) => {
      const cmp = best.compareTo(current);
      return cmp < 0 ? current : best;
    });
  }
}
