/**
 * Port of `Rails::Railtie` from `railties/lib/rails/railtie.rb`.
 *
 * Each framework subclasses `Trailtie` to register initializers and
 * lifecycle blocks. Subclasses opt in to the registry explicitly with
 * `Trailtie.register(SubClass)` — there is no `inherited` hook in TS.
 * The class is named `Trailtie` (not `Railtie`) to signal that trails
 * railties are not Rails::Railtie subclasses; the api:compare rename
 * map handles the cross-language name resolution.
 */
import { underscore } from "@blazetrails/activesupport";
import { Initializable } from "./initializable.js";
import { Configuration } from "./trailtie/configuration.js";

export const ABSTRACT_RAILTIES = ["Trailtie", "Engine", "Application"] as const;

type BlockKind = "rakeTasks" | "console" | "runner" | "generators" | "server";
type AppBlock = (app: unknown) => void;
type Host = {
  _loadIndex?: number;
  _railtieName?: string;
  _instance?: Trailtie;
  _blocks?: Partial<Record<BlockKind, AppBlock[]>>;
};

/** @internal Module-wide load counter shared across subclasses. */
let loadCounter = 0;

function host(klass: typeof Trailtie): Host {
  return klass as unknown as Host;
}

export class Trailtie extends Initializable {
  /** @internal */
  private static readonly _registry: Array<typeof Trailtie> = [];

  protected _config?: Configuration;

  constructor() {
    super();
    const klass = this.constructor as typeof Trailtie;
    if (klass.isAbstractRailtie()) {
      throw new Error(`${klass.name} is abstract, you cannot instantiate it directly.`);
    }
  }

  /** Non-abstract subclasses, sorted by load order. Mirrors `Rails::Railtie.subclasses`. */
  static subclasses(): Array<typeof Trailtie> {
    return [...Trailtie._registry]
      .filter((s) => !s.isAbstractRailtie())
      .sort((a, b) => (host(a)._loadIndex ?? 0) - (host(b)._loadIndex ?? 0));
  }

  /**
   * Explicit subclass registration — replaces Rails' `inherited` hook.
   * Each subclass calls `Trailtie.register(MyTrailtie)` once at load.
   */
  static register(subclass: typeof Trailtie): void {
    if (Trailtie._registry.includes(subclass)) return;
    if (!Object.prototype.hasOwnProperty.call(subclass, "_loadIndex")) {
      host(subclass)._loadIndex = ++loadCounter;
    }
    Trailtie._registry.push(subclass);
  }

  static isAbstractRailtie(): boolean {
    return (ABSTRACT_RAILTIES as readonly string[]).includes(this.name);
  }

  /** Set or get the short railtie name (defaults to underscored class name). */
  static railtieName(name?: string): string {
    const h = host(this);
    if (name !== undefined) h._railtieName = name;
    if (!Object.prototype.hasOwnProperty.call(this, "_railtieName") || !h._railtieName) {
      h._railtieName = underscore(this.name).replace(/\//g, "_");
    }
    return h._railtieName;
  }

  /** Lazily-created per-class singleton. */
  static instance<T extends typeof Trailtie>(this: T): InstanceType<T> {
    const h = host(this) as { _instance?: InstanceType<T> };
    if (!Object.prototype.hasOwnProperty.call(this, "_instance") || !h._instance) {
      h._instance = new (this as unknown as new () => InstanceType<T>)();
    }
    return h._instance;
  }

  static get config(): Configuration {
    return (this as typeof Trailtie).instance().config;
  }

  static configure(block: (this: Trailtie) => void): void {
    (this as typeof Trailtie).instance().configure(block);
  }

  static rakeTasks = makeBlockRegistrar("rakeTasks");
  static console = makeBlockRegistrar("console");
  static runner = makeBlockRegistrar("runner");
  static generators = makeBlockRegistrar("generators");
  static server = makeBlockRegistrar("server");

  get config(): Configuration {
    if (!this._config) this._config = new Configuration();
    return this._config;
  }

  get railtieName(): string {
    return (this.constructor as typeof Trailtie).railtieName();
  }

  /** Run `block` with `this` as the receiver — mirrors Ruby `instance_eval`. */
  configure(block: (this: Trailtie) => void): void {
    block.call(this);
  }

  inspect(): string {
    return `#<${this.constructor.name}>`;
  }

  /** @internal */
  protected runConsoleBlocks(app: unknown): void {
    eachRegisteredBlock(this, "console", app);
  }
  /** @internal */
  protected runGeneratorsBlocks(app: unknown): void {
    eachRegisteredBlock(this, "generators", app);
  }
  /** @internal */
  protected runRunnerBlocks(app: unknown): void {
    eachRegisteredBlock(this, "runner", app);
  }
  /** @internal */
  protected runTasksBlocks(app: unknown): void {
    eachRegisteredBlock(this, "rakeTasks", app);
  }
  /** @internal */
  protected runServerBlocks(app: unknown): void {
    eachRegisteredBlock(this, "server", app);
  }
}

function makeBlockRegistrar(kind: BlockKind) {
  return function (this: typeof Trailtie, block?: AppBlock): AppBlock[] {
    const h = host(this);
    if (!Object.prototype.hasOwnProperty.call(this, "_blocks")) h._blocks = {};
    const blocks = (h._blocks![kind] ??= []);
    if (block) blocks.push(block);
    return blocks;
  };
}

/** @internal Walk the prototype chain firing each ancestor's registered blocks. */
function eachRegisteredBlock(instance: Trailtie, kind: BlockKind, app: unknown): void {
  let klass: typeof Trailtie | null = instance.constructor as typeof Trailtie;
  const seen = new Set<typeof Trailtie>();
  while (klass && !seen.has(klass)) {
    seen.add(klass);
    const blocks = host(klass)._blocks?.[kind];
    if (blocks) for (const b of blocks) b(app);
    const parent = Object.getPrototypeOf(klass) as typeof Trailtie | null;
    klass = parent && parent.prototype instanceof Initializable ? parent : null;
  }
}
