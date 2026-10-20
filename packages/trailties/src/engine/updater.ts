export type UpdaterGenerator = Record<string, unknown>;
export type UpdaterGeneratorFactory = () => UpdaterGenerator;

export class Updater {
  private static _generator?: UpdaterGenerator;
  private static _factory?: UpdaterGeneratorFactory;

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-engine-updater-generator-factory-seam
   */
  static setGeneratorFactory(factory: UpdaterGeneratorFactory): void {
    this._factory = factory;
    this._generator = undefined;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-engine-updater-generator-factory-seam
   */
  static resetGenerator(): void {
    this._generator = undefined;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-engine-updater-generator-factory-seam
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
