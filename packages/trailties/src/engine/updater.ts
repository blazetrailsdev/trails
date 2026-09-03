export type UpdaterGenerator = Record<string, unknown>;
export type UpdaterGeneratorFactory = () => UpdaterGenerator;

export class Updater {
  private static _generator?: UpdaterGenerator;
  private static _factory?: UpdaterGeneratorFactory;

  /**
   * @internal Trails-private. Inject the `PluginGenerator` factory. Resets the
   * memoised generator.
   *
   * @noRailsEquivalent CONVERGEABLE — Rails builds the generator inline in
   * `Updater.generator` (engine/updater.rb:10-13); trails has no
   * `PluginGenerator` / `ENGINE_ROOT` yet, so the factory is injected. The seam
   * retires when `PluginGenerator` lands.
   */
  static setGeneratorFactory(factory: UpdaterGeneratorFactory): void {
    this._factory = factory;
    this._generator = undefined;
  }

  /**
   * @internal Drop the cached generator without changing the factory.
   *
   * @noRailsEquivalent CONVERGEABLE — Rails memoises with `@generator ||=`
   * (engine/updater.rb:11), an ivar tests reset by allocating a new object; it
   * retires with `setGeneratorFactory` above.
   */
  static resetGenerator(): void {
    this._generator = undefined;
  }

  /**
   * @internal Clear both the cached generator and the installed factory.
   *
   * @noRailsEquivalent CONVERGEABLE — the full teardown for the injected
   * factory above (engine/updater.rb:10-13 has no such state); it retires with
   * it.
   */
  static reset(): void {
    this._generator = undefined;
    this._factory = undefined;
  }

  static generator(): UpdaterGenerator {
    if (this._generator) return this._generator;
    if (!this._factory) {
      throw new Error(
        "Trails::Engine::Updater has no generator factory installed — call setGeneratorFactory() (PluginGenerator port pending)",
      );
    }
    return (this._generator = this._factory());
  }

  static run(action: string): unknown {
    const gen = this.generator();
    const fn = gen[action];
    if (typeof fn !== "function") {
      throw new Error(`Trails::Engine::Updater has no generator action ${JSON.stringify(action)}`);
    }
    return fn.call(gen);
  }
}
