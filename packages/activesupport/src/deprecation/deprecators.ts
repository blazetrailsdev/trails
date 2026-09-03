import type { Deprecation, DeprecationBehaviorInput } from "../deprecation.js";

type OptionName = "silenced" | "debug" | "behavior" | "disallowedBehavior" | "disallowedWarnings";

export class Deprecators {
  private _options: Map<OptionName, unknown>;
  private _deprecators: Map<string, Deprecation>;

  constructor() {
    this._options = new Map();
    this._deprecators = new Map();
  }

  get(name: string): Deprecation | undefined {
    return this._deprecators.get(name);
  }

  set(name: string, deprecator: Deprecation): void {
    this.applyOptions(deprecator);
    this._deprecators.set(name, deprecator);
  }

  each(block: (deprecator: Deprecation) => void): void {
    for (const deprecator of this._deprecators.values()) block(deprecator);
  }

  setSilenced(silenced: boolean): void {
    this.setOption("silenced", silenced);
  }

  setDebug(debug: boolean): void {
    this.setOption("debug", debug);
  }

  setBehavior(behavior: DeprecationBehaviorInput): void {
    this.setOption("behavior", behavior);
  }

  setDisallowedBehavior(disallowedBehavior: DeprecationBehaviorInput): void {
    this.setOption("disallowedBehavior", disallowedBehavior);
  }

  setDisallowedWarnings(disallowedWarnings: Deprecation["disallowedWarnings"]): void {
    this.setOption("disallowedWarnings", disallowedWarnings);
  }

  silence<T>(block: () => T): T {
    this.each((deprecator) => deprecator.beginSilence());
    try {
      return block();
    } finally {
      this.each((deprecator) => deprecator.endSilence());
    }
  }

  private setOption(name: OptionName, value: unknown): void {
    this._options.set(name, value);
    this.each((deprecator) => {
      (deprecator as unknown as Record<string, unknown>)[name] = value;
    });
  }

  private applyOptions(deprecator: Deprecation): void {
    for (const [name, value] of this._options) {
      (deprecator as unknown as Record<string, unknown>)[name] = value;
    }
  }
}
