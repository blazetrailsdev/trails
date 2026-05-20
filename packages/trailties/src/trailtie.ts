/**
 * Port of `Rails::Railtie` from `railties/lib/rails/railtie.rb`.
 * Subclasses opt in to the registry explicitly via `Trailtie.register(...)`
 * — there is no `inherited` hook in TS. The block runners
 * (rakeTasks/console/runner/generators/server) and the `Configurable`
 * mixin land in PR 2.1b.
 */
import { underscore } from "@blazetrails/activesupport";
import { Initializable } from "./initializable.js";
import { Configuration } from "./trailtie/configuration.js";

export const ABSTRACT_RAILTIES = ["Trailtie", "Engine", "Application"] as const;

type Host = { _loadIndex?: number; _railtieName?: string; _instance?: Trailtie };

/** @internal Module-wide load counter shared across subclasses. */
let loadCounter = 0;
const host = (k: typeof Trailtie): Host => k as unknown as Host;

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

  /** Explicit subclass registration — replaces Rails' `inherited` hook. */
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
}
