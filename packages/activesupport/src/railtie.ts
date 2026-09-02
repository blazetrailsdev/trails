/**
 * Base Railtie class — mirrors Rails::Railtie.
 *
 * Each engine/component (ActiveModel, ActionController, etc.) subclasses
 * Railtie to register named initializer blocks and a shared configuration
 * object. The application runner calls `Railtie.runAllInitializers()` to
 * fire them in registration order.
 *
 * Mirrors: Rails::Railtie (railties/lib/rails/railtie.rb)
 */
import type { Deprecation } from "./deprecation.js";

/**
 * An initializer body. Rails' `Initializable::Initializer#run` is
 * `@context.instance_exec(*args, &block)` (`railties/lib/rails/initializable.rb:31-33`)
 * and `run_initializers(group = :default, *args)` passes the application
 * through (`initializable.rb:60-63`), so the block Rails writes as
 * `initializer "name" do |app|` receives it.
 */
export type InitializerBlock = (...args: unknown[]) => void;

export class Railtie {
  /**
   * All registered subclasses — tracked so the application can enumerate
   * all railties at boot.
   *
   * Mirrors: Rails::Railtie.subclasses
   */
  static readonly subclasses: Array<typeof Railtie> = [];

  /**
   * Shared registry of per-framework deprecators, keyed by framework name.
   * Each framework's railtie registers its own deprecator here during
   * initialization.
   *
   * Mirrors: Rails `app.deprecators` (Rails::Application::DeprecatorsProxy)
   */
  static readonly deprecators: Partial<Record<string, Deprecation>> = {};

  private static _config: Record<string, unknown> = {};

  /**
   * Per-class config object. Each subclass gets its own copy on first
   * access — deep-cloned when possible, otherwise shallow-copied — so
   * parent defaults propagate until the subclass config is read
   * (copy-on-first-access).
   *
   * Mirrors: Rails::Railtie.config
   */
  static get config(): Record<string, unknown> {
    const host = this as any;
    if (!Object.prototype.hasOwnProperty.call(host, "_config")) {
      const parent = Object.getPrototypeOf(host)._config ?? {};
      // Best-effort deep-clone so nested objects/arrays are isolated per
      // subclass. Falls back to a shallow copy when structuredClone is
      // unavailable or the config contains non-clone-safe values (functions,
      // class instances, cycles, BigInt) — config is expected to hold plain
      // scalar/object settings in normal Rails-style usage.
      try {
        host._config =
          typeof structuredClone === "function" ? structuredClone(parent) : { ...parent };
      } catch {
        host._config = { ...parent };
      }
    }
    return host._config as Record<string, unknown>;
  }

  private static _initializers: Array<{ name: string; block: InitializerBlock }> = [];

  /**
   * Register a named initializer block.
   *
   * Mirrors: Rails::Railtie.initializer
   */
  static initializer(name: string, block: InitializerBlock): void {
    const host = this as any;
    if (!Object.prototype.hasOwnProperty.call(host, "_initializers")) {
      host._initializers = [];
    }
    host._initializers.push({ name, block });
  }

  /**
   * The initializers registered directly on this class, in registration
   * order.
   *
   * Mirrors: Rails::Initializable::ClassMethods#initializers
   * (`railties/lib/rails/initializable.rb:70-72`)
   */
  static get initializers(): Array<{ name: string; block: InitializerBlock }> {
    const host = this as any;
    return Object.prototype.hasOwnProperty.call(host, "_initializers") ? host._initializers : [];
  }

  /**
   * Run all initializers registered on this class (in registration order).
   *
   * Mirrors: Rails::Railtie#run_initializers
   */
  static runInitializers(...args: unknown[]): void {
    for (const { block } of this.initializers) {
      block(...args);
    }
  }

  /**
   * Run initializers for every registered subclass.
   *
   * Mirrors: Rails application initialization pipeline.
   */
  static runAllInitializers(...args: unknown[]): void {
    for (const sub of Railtie.subclasses) {
      sub.runInitializers(...args);
    }
  }
}

/**
 * Register `subclass` with the Railtie registry.
 *
 * Call this in each subclass's static init block:
 *   static { registerRailtie(this); }
 *
 * Mirrors: Rails::Railtie.inherited (called automatically by Ruby when
 * a class subclasses Railtie; we replicate it with an explicit call since
 * JavaScript has no `inherited` hook).
 */
export function registerRailtie(subclass: typeof Railtie): void {
  if (!Railtie.subclasses.includes(subclass)) {
    Railtie.subclasses.push(subclass);
  }
}
