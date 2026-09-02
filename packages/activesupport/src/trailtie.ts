/**
 * Port of `Rails::Railtie` from `railties/lib/rails/railtie.rb`. Subclasses
 * opt in to the registry via `Trailtie.register(...)` — no `inherited`
 * hook. Block runners (`rakeTasks`/`console`/`runner`/`generators`/
 * `server`) walk ancestors like Rails' `each_registered_block`.
 */
import { RuntimeError } from "@blazetrails/ruby-compat";
import { underscore } from "./inflector.js";
import { Initializable } from "./initializable.js";
import { Configuration } from "./trailtie/configuration.js";
import { ownState, readOwnState, writeOwnState } from "./trailtie/per-class-state.js";
import { assertNotSealed } from "./trailtie/configurable.js";

/**
 * Mirrors `ABSTRACT_RAILTIES` (`railties/lib/rails/railtie.rb:142`), whose
 * Ruby members are the fully-qualified constant names `Rails::Railtie`,
 * `Rails::Engine` and `Rails::Application`. A TypeScript class's `name` is
 * unqualified and every framework railtie is spelled `Trailtie` in its own
 * package, so membership is by class identity instead of by name; `Engine`
 * and `Application` add themselves where they are defined.
 */
export const ABSTRACT_RAILTIES: unknown[] = [];
let loadCounter = 0;

export type BlockRunnerKind = "rakeTasks" | "console" | "runner" | "generators" | "server";
export type TrailtieBlock = (this: Trailtie, app: unknown) => void;

const _registry: Array<typeof Trailtie> = [];

export class Trailtie extends Initializable {
  protected _config?: Configuration;

  constructor() {
    super();
    const klass = this.constructor as typeof Trailtie;
    if (klass.isAbstractRailtie()) {
      throw new RuntimeError(`${klass.name} is abstract, you cannot instantiate it directly.`);
    }
  }

  /** Non-abstract subclasses, sorted by load order. Mirrors `Rails::Railtie.subclasses`. */
  static subclasses(): Array<typeof Trailtie> {
    return [..._registry]
      .filter((s) => !s.isAbstractRailtie())
      .sort(
        (a, b) =>
          (readOwnState<number>(a, "_loadIndex") ?? 0) -
          (readOwnState<number>(b, "_loadIndex") ?? 0),
      );
  }

  /** Explicit subclass registration — replaces Rails' `inherited` hook. */
  static register(subclass: typeof Trailtie): void {
    if (_registry.includes(subclass)) return;
    assertNotSealed(subclass);
    if (readOwnState<number>(subclass, "_loadIndex") === undefined) {
      writeOwnState(subclass, "_loadIndex", ++loadCounter);
    }
    _registry.push(subclass);
  }

  static isAbstractRailtie(): boolean {
    return ABSTRACT_RAILTIES.includes(this);
  }

  /** Set or get the short railtie name (defaults to underscored class name). */
  static railtieName(name?: string): string {
    if (name !== undefined) writeOwnState(this, "_railtieName", name);
    let existing = readOwnState<string>(this, "_railtieName");
    if (!existing) {
      existing = underscore(this.name).replace(/\//g, "_");
      writeOwnState(this, "_railtieName", existing);
    }
    return existing;
  }

  /** Lazily-created per-class singleton. */
  static instance<T extends typeof Trailtie>(this: T): InstanceType<T> {
    return ownState(this, "_instance", () => new (this as unknown as new () => InstanceType<T>)());
  }

  static get config(): Configuration {
    return this.instance().config;
  }

  static configure(block: (this: Trailtie) => void): void {
    this.instance().configure(block);
  }

  static rakeTasks(block: TrailtieBlock): void {
    registerBlockFor(this, "rakeTasks", block);
  }
  static console(block: TrailtieBlock): void {
    registerBlockFor(this, "console", block);
  }
  static runner(block: TrailtieBlock): void {
    registerBlockFor(this, "runner", block);
  }
  static generators(block: TrailtieBlock): void {
    registerBlockFor(this, "generators", block);
  }
  static server(block: TrailtieBlock): void {
    registerBlockFor(this, "server", block);
  }

  /**
   * @internal Read the blocks registered directly on `klass` for `kind`.
   *
   * @noRailsEquivalent PERMANENT — Rails reads the per-class block array
   * straight off the class with `instance_variable_get` (railtie.rb:235-241).
   * JS class objects have no ivars, so own-state has to be read through a named
   * accessor; see `ownState` in trailtie/per-class-state.ts.
   */
  static registeredBlocksFor(kind: BlockRunnerKind): TrailtieBlock[] {
    return readOwnState<TrailtieBlock[]>(this, blockKey(kind)) ?? [];
  }

  get config(): Configuration {
    if (!this._config) this._config = new Configuration();
    return this._config;
  }

  get railtieName(): string {
    return (this.constructor as typeof Trailtie).railtieName();
  }

  configure(block: (this: Trailtie) => void): void {
    block.call(this);
  }

  inspect(): string {
    return `#<${this.constructor.name}>`;
  }

  runConsoleBlocks(app: unknown): void {
    eachRegisteredBlock(this, "console", (b) => b.call(this, app));
  }
  runGeneratorsBlocks(app: unknown): void {
    eachRegisteredBlock(this, "generators", (b) => b.call(this, app));
  }
  runRunnerBlocks(app: unknown): void {
    eachRegisteredBlock(this, "runner", (b) => b.call(this, app));
  }
  runTasksBlocks(app: unknown): void {
    eachRegisteredBlock(this, "rakeTasks", (b) => b.call(this, app));
  }
  runServerBlocks(app: unknown): void {
    eachRegisteredBlock(this, "server", (b) => b.call(this, app));
  }
}

function blockKey(kind: BlockRunnerKind): string {
  return `_blocks_${kind}`;
}

/** @internal */
function registerBlockFor(
  klass: typeof Trailtie,
  type: BlockRunnerKind,
  block: TrailtieBlock,
): void {
  ownState(klass, blockKey(type), () => [] as TrailtieBlock[]).push(block);
}

/** @internal */
function eachRegisteredBlock(
  instance: Trailtie,
  kind: BlockRunnerKind,
  fn: (b: TrailtieBlock) => void,
): void {
  let klass: typeof Trailtie | null = instance.constructor as typeof Trailtie;
  while (klass && "registeredBlocksFor" in klass) {
    for (const block of klass.registeredBlocksFor(kind)) fn(block);
    klass = Object.getPrototypeOf(klass) as typeof Trailtie | null;
  }
}

ABSTRACT_RAILTIES.push(Trailtie);

/**
 * Empty the railtie registry, returning the function that puts it back.
 *
 * @noRailsEquivalent PERMANENT — Rails resets `Railtie.subclasses` between
 * cases by forking a subprocess per test (`include ActiveSupport::Testing::Isolation`,
 * `railties/test/railties/railtie_test.rb:8`). A TS module's state outlives the
 * suite and trails has no subprocess isolation, so tests need an explicit
 * reset, as `resetLoadHooks` does for the load-hook registries.
 */
export function resetTrailtieRegistry(): () => void {
  const saved = [..._registry];
  _registry.length = 0;
  return () => {
    _registry.length = 0;
    _registry.push(...saved);
  };
}
