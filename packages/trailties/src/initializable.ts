// Port of `Rails::Initializable` from `railties/lib/rails/initializable.rb`.
export type InitializerGroup = string;

export interface InitializerOptions {
  before?: string;
  after?: string;
  group?: InitializerGroup;
}

export type InitializerBlock<C = unknown> = (this: C, ...args: unknown[]) => unknown;

export class Initializer<C = unknown> {
  readonly name: string;
  readonly block: InitializerBlock<C>;
  private readonly _context: C | null;
  private readonly _options: InitializerOptions;

  constructor(
    name: string,
    context: C | null,
    options: InitializerOptions,
    block: InitializerBlock<C>,
  ) {
    this.name = name;
    this._context = context;
    this._options = { ...options, group: options.group ?? "default" };
    this.block = block;
  }

  get before(): string | undefined {
    return this._options.before;
  }
  get after(): string | undefined {
    return this._options.after;
  }

  belongsTo(group: InitializerGroup): boolean {
    return this._options.group === group || this._options.group === "all";
  }

  run(...args: unknown[]): unknown {
    if (this._context === null) {
      throw new Error(
        `Initializer "${this.name}" is unbound; call bind(context) (or run via runInitializers) first`,
      );
    }
    return this.block.apply(this._context, args);
  }

  bind<T>(context: T): Initializer<T> {
    if (this._context !== null) return this as unknown as Initializer<T>;
    return new Initializer<T>(
      this.name,
      context,
      this._options,
      this.block as unknown as InitializerBlock<T>,
    );
  }

  get contextClass(): unknown {
    return (this._context as { constructor?: unknown } | null)?.constructor;
  }
}

export class Collection extends Array<Initializer> {
  plus(other: Initializer[]): Collection {
    return new Collection(...this, ...other);
  }

  /** @internal Mirrors Rails `tsort_each_child`. */
  tsortEachChild(node: Initializer): Initializer[] {
    return this.filter((i) => i.before === node.name || i.name === node.after);
  }

  /** DFS post-order matching Ruby `TSort#tsort_each`. Stable on iteration order. */
  tsort(): Initializer[] {
    const out: Initializer[] = [];
    const visited = new Set<Initializer>();
    const visiting = new Set<Initializer>();
    const visit = (n: Initializer): void => {
      if (visited.has(n)) return;
      if (visiting.has(n)) throw new Error(`Cyclic initializer dependency at "${n.name}"`);
      visiting.add(n);
      for (const child of this.tsortEachChild(n)) visit(child);
      visiting.delete(n);
      visited.add(n);
      out.push(n);
    };
    for (const n of this) visit(n);
    return out;
  }
}

/** @internal Per-class own collections, keyed by constructor. */
const OWN = new WeakMap<typeof Initializable, Collection>();

export class Initializable {
  private _initializers?: Collection;
  private _ran?: boolean;

  /** @internal Per-class collection — mirrors Rails' `@initializers ||= ...`. */
  static _ownInitializers(): Collection {
    let own = OWN.get(this);
    if (!own) {
      own = new Collection();
      OWN.set(this, own);
    }
    return own;
  }

  /** Subclasses may override to splice in extra initializers. */
  static get initializers(): Collection {
    return this._ownInitializers();
  }

  static initializersChain(): Collection {
    const classes: Array<typeof Initializable> = [this];
    for (
      let cursor: unknown = Object.getPrototypeOf(this);
      cursor && cursor !== Function.prototype && cursor !== Object.prototype;
      cursor = Object.getPrototypeOf(cursor)
    ) {
      classes.unshift(cursor as typeof Initializable);
    }
    let chain = new Collection();
    for (const klass of classes) {
      if (klass === Initializable || klass.prototype instanceof Initializable) {
        chain = chain.plus(klass.initializers);
      }
    }
    return chain;
  }

  static initializersFor(binding: unknown): Collection {
    return new Collection(...this.initializersChain().map((i) => i.bind(binding)));
  }

  static initializer<C = unknown>(name: string, block: InitializerBlock<C>): void;
  static initializer<C = unknown>(
    name: string,
    opts: InitializerOptions,
    block: InitializerBlock<C>,
  ): void;
  static initializer<C = unknown>(
    name: string,
    optsOrBlock: InitializerOptions | InitializerBlock<C>,
    maybeBlock?: InitializerBlock<C>,
  ): void {
    const block = typeof optsOrBlock === "function" ? optsOrBlock : maybeBlock;
    const opts: InitializerOptions = typeof optsOrBlock === "function" ? {} : { ...optsOrBlock };
    if (typeof block !== "function") {
      throw new TypeError("A block must be passed when defining an initializer");
    }
    const own = this._ownInitializers();
    const referencedBefore = opts.before !== undefined && own.some((i) => i.name === opts.before);
    if (own.length > 0 && !referencedBefore && opts.after === undefined) {
      opts.after = own[own.length - 1].name;
    }
    own.push(new Initializer<C>(name, null, opts, block) as Initializer);
  }

  get initializers(): Collection {
    if (!this._initializers) {
      this._initializers = (this.constructor as typeof Initializable).initializersFor(this);
    }
    return this._initializers;
  }

  runInitializers(group: InitializerGroup = "default", ...args: unknown[]): void {
    if (this._ran) return;
    for (const init of this.initializers.tsort()) {
      if (init.belongsTo(group)) init.run(...args);
    }
    this._ran = true;
  }
}
