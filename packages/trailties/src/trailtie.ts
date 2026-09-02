/**
 * Port of `Rails::Railtie` from `railties/lib/rails/railtie.rb`. Subclasses
 * opt in to the registry via `Trailtie.register(...)` — no `inherited`
 * hook. Block runners (`rakeTasks`/`console`/`runner`/`generators`/
 * `server`) walk ancestors like Rails' `each_registered_block`.
 *
 * This is the ONLY `Trailtie` in trails. Every framework railtie subclasses it
 * — `ActiveModel::Railtie`, `ActiveRecord::Railtie`, `ActionView::Railtie`,
 * `ActionController::Railtie`, `ActionDispatch::Railtie`, `GlobalID::Railtie`,
 * `ActiveSupport::Railtie` — and they live in `src/trailties/` rather than at
 * their own gem's `railtie.rb` path.
 *
 * That relocation is the one deviation this file's shape costs, and it is
 * forced: `tsc --build` requires a DAG, `trailties` already depends on
 * `activerecord` → `activemodel`, so `packages/activemodel/src/trailtie.ts`
 * cannot import `Trailtie` from here without a cycle. Ruby escapes it because
 * `active_model/railtie.rb:4`'s `require "rails"` is a runtime, opt-in load
 * with no static graph, and the zero-import slot idiom does not help across an
 * `extends` edge (see CLAUDE.md — nothing would then load the subclass modules
 * at all, so their registration never runs). Moving `Rails::Railtie` DOWN into
 * activesupport instead was tried and rejected (PR #7386): it costs 58 methods
 * off trailties' `parity:api` score, since `PATH_SEGMENT_ALIASES` maps
 * `railtie.rb` here. The six moved files contribute no methods at all, so this
 * direction costs ~0 — and it matches the framework → railties edge Rails
 * itself takes.
 */
import { underscore } from "@blazetrails/activesupport";
import { Initializable } from "./initializable.js";
import { Configuration } from "./trailtie/configuration.js";
import { ownState, readOwnState, writeOwnState } from "./trailtie/per-class-state.js";
import { assertNotSealed } from "./trailtie/configurable.js";

/**
 * Mirrors `ABSTRACT_RAILTIES` (`railtie.rb:142`), which lists the three
 * classes by their FULLY-QUALIFIED Ruby names — `Rails::Railtie`,
 * `Rails::Engine`, `Rails::Application`. TypeScript class names carry no
 * namespace, and every framework railtie is `Trailtie` inside its own package
 * (`ActiveModel::Railtie`, `ActionView::Railtie`, ...), so a bare-name list
 * would call all of them abstract. The list holds the three classes
 * themselves, which is what the Ruby names denote.
 *
 * @noRailsEquivalent PERMANENT — see the paragraph above; this is the
 * unqualified-class-name shortcoming, not a new concept.
 */
export const ABSTRACT_RAILTIES: unknown[] = [];

export function abstractRailtie(klass: unknown): void {
  ABSTRACT_RAILTIES.push(klass);
}
let loadCounter = 0;

export type BlockRunnerKind = "rakeTasks" | "console" | "runner" | "generators" | "server";
export type TrailtieBlock = (this: Trailtie, app: unknown) => void;

export class Trailtie extends Initializable {
  static {
    abstractRailtie(this);
  }

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
      .sort(
        (a, b) =>
          (readOwnState<number>(a, "_loadIndex") ?? 0) -
          (readOwnState<number>(b, "_loadIndex") ?? 0),
      );
  }

  /** Explicit subclass registration — replaces Rails' `inherited` hook. */
  static register(subclass: typeof Trailtie): void {
    if (Trailtie._registry.includes(subclass)) return;
    assertNotSealed(subclass);
    if (readOwnState<number>(subclass, "_loadIndex") === undefined) {
      writeOwnState(subclass, "_loadIndex", ++loadCounter);
    }
    Trailtie._registry.push(subclass);
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
