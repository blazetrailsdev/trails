import { underscore } from "@blazetrails/activesupport";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Initializable } from "./initializable.js";
import { Configuration } from "./trailtie/configuration.js";
import { ownState, readOwnState, writeOwnState } from "./trailtie/per-class-state.js";
import { assertNotSealed } from "./trailtie/configurable.js";
import { getRubyClassPath, setRubyClassPath } from "./ruby-class-path-slot.js";

const ABSTRACT_RAILTIES = ["Rails::Railtie", "Rails::Engine", "Rails::Application"];

let loadCounter = 0;

/**
 * Ruby's `Module#name` (`vendor/ruby/variable.c:130` `rb_mod_name`), which
 * `abstract_railtie?` (`railtie.rb:173`) and `railtie_name` (`railtie.rb:178`)
 * both read. A TypeScript class name carries no namespace, so the path each
 * Railtie is defined under is declared through {@link setRubyClassPath}.
 */
function rubyClassPath(klass: typeof Trailtie): string {
  return getRubyClassPath(klass) ?? klass.name;
}

/** @internal */
function generateRailtieName(string: string): string {
  return underscore(string).replace(/\//g, "_");
}

export type BlockRunnerKind = "rakeTasks" | "console" | "runner" | "generators" | "server";
export type TrailtieBlock = (this: Trailtie, app: unknown) => void;

export class Trailtie extends Initializable {
  /** @internal */
  static readonly _registry: Array<typeof Trailtie> = [];

  protected _config?: Configuration;

  constructor() {
    super();
    const klass = this.constructor as typeof Trailtie;
    if (klass.isAbstractRailtie()) {
      throw new RuntimeError(`${klass.name} is abstract, you cannot instantiate it directly.`);
    }
  }

  static subclasses(): Array<typeof Trailtie> {
    return [...Trailtie._registry]
      .filter((s) => !s.isAbstractRailtie())
      .sort(
        (a, b) =>
          (readOwnState<number>(a, "_loadIndex") ?? 0) -
          (readOwnState<number>(b, "_loadIndex") ?? 0),
      );
  }

  static register(subclass: typeof Trailtie): void {
    if (Trailtie._registry.includes(subclass)) return;
    assertNotSealed(subclass);
    if (readOwnState<number>(subclass, "_loadIndex") === undefined) {
      writeOwnState(subclass, "_loadIndex", ++loadCounter);
    }
    Trailtie._registry.push(subclass);
  }

  static isAbstractRailtie(): boolean {
    return ABSTRACT_RAILTIES.includes(rubyClassPath(this));
  }

  static railtieName(name?: string): string {
    if (name !== undefined) writeOwnState(this, "_railtieName", name);
    let existing = readOwnState<string>(this, "_railtieName");
    if (!existing) {
      existing = generateRailtieName(rubyClassPath(this));
      writeOwnState(this, "_railtieName", existing);
    }
    return existing;
  }

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
   * @internal
   * @noRailsEquivalent PERMANENT
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

/** @noRailsEquivalent PERMANENT */
export function resetTrailtieRegistry(): () => void {
  const registry = [...Trailtie._registry];
  const toPrepareBlocks = [...Configuration._toPrepareBlocks];
  const options = { ...Configuration._options };

  return () => {
    Trailtie._registry.length = 0;
    Trailtie._registry.push(...registry);
    Configuration._toPrepareBlocks.length = 0;
    Configuration._toPrepareBlocks.push(...toPrepareBlocks);
    for (const key of Object.keys(Configuration._options)) delete Configuration._options[key];
    Object.assign(Configuration._options, options);
  };
}

setRubyClassPath(Trailtie, "Rails::Railtie");
