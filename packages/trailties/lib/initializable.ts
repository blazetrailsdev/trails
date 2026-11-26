import { ArgumentError, extend, included, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { Application } from "./application.js";

export type InitializerGroup = string;

export interface InitializerOptions {
  before?: string;
  after?: string;
  group?: InitializerGroup;
}

export type InitializerBlock<C = unknown> = (
  this: C,
  app: Application,
  ...args: unknown[]
) => unknown;

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
    return this.block.apply(this._context, args as Parameters<InitializerBlock<C>>);
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

  tsortEachNode(block: (initializer: Initializer) => void): void {
    this.forEach((initializer) => block(initializer));
  }

  tsortEachChild(initializer: Initializer): Initializer[] {
    return this.filter((i) => i.before === initializer.name || i.name === initializer.after);
  }

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
    this.tsortEachNode(visit);
    return out;
  }

  tsortEach(block: (initializer: Initializer) => void): void {
    for (const initializer of this.tsort()) block(initializer);
  }
}

/** @internal */
const OWN = new WeakMap<object, Collection>();

export interface InitializableClass {
  readonly initializers: Collection;
  initializersChain(): Collection;
  initializersFor(binding: unknown): Collection;
  initializer<C = unknown>(name: string, block: InitializerBlock<C>): void;
  initializer<C = unknown>(
    name: string,
    opts: InitializerOptions,
    block: InitializerBlock<C>,
  ): void;
}

export const ClassMethods = {
  get initializers(): Collection {
    let own = OWN.get(this);
    if (!own) {
      own = new Collection();
      OWN.set(this, own);
    }
    return own;
  },

  initializersChain(this: InitializableClass): Collection {
    const ancestors: object[] = [this];
    for (
      let cursor: unknown = Object.getPrototypeOf(this);
      cursor && cursor !== Function.prototype && cursor !== Object.prototype;
      cursor = Object.getPrototypeOf(cursor)
    ) {
      ancestors.unshift(cursor);
    }
    let initializers = new Collection();
    for (const klass of ancestors) {
      if (!rbObjRespondTo(klass, "initializers")) continue;
      initializers = initializers.plus((klass as InitializableClass).initializers);
    }
    return initializers;
  },

  initializersFor(this: InitializableClass, binding: unknown): Collection {
    return new Collection(...this.initializersChain().map((i) => i.bind(binding)));
  },

  initializer<C = unknown>(
    this: InitializableClass,
    name: string,
    opts: InitializerOptions | InitializerBlock<C> = {},
    blk?: InitializerBlock<C>,
  ): void {
    if (typeof opts === "function") [opts, blk] = [{}, opts];
    if (typeof blk !== "function") {
      throw new ArgumentError("A block must be passed when defining an initializer");
    }
    opts = { ...opts };
    if (
      !(this.initializers.length === 0 || this.initializers.find((i) => i.name === opts.before))
    ) {
      opts.after ??= this.initializers.at(-1)!.name;
    }
    this.initializers.push(new Initializer<C>(name, null, opts, blk) as Initializer);
  },
};

/** @internal */
const INITIALIZERS = new WeakMap<object, Collection>();

export const Initializable = {
  Initializer,
  Collection,
  ClassMethods,

  async runInitializers(
    this: { initializers: Collection; _ran?: boolean },
    group: InitializerGroup = "default",
    ...args: unknown[]
  ): Promise<void> {
    if (this._ran) return;
    let ran: Promise<unknown> = Promise.resolve();
    this.initializers.tsortEach((initializer) => {
      ran = ran.then(() => (initializer.belongsTo(group) ? initializer.run(...args) : undefined));
    });
    await ran;
    this._ran = true;
  },

  get initializers(): Collection {
    let initializers = INITIALIZERS.get(this);
    if (!initializers) {
      initializers = (this.constructor as unknown as InitializableClass).initializersFor(this);
      INITIALIZERS.set(this, initializers);
    }
    return initializers;
  },

  [included](base: object): void {
    extend(base, ClassMethods);
  },
};
