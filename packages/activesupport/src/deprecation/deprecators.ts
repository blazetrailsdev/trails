/**
 * Mirrors: ActiveSupport::Deprecation::Deprecators
 * (activesupport/lib/active_support/deprecation/deprecators.rb:1-60)
 */

import type { Deprecation, DeprecationBehaviorInput } from "../deprecation.js";

type OptionName = "silenced" | "debug" | "behavior" | "disallowedBehavior" | "disallowedWarnings";

/**
 * A managed collection of deprecators. Configuration methods, such as
 * #behavior=, affect all deprecators in the collection. Additionally, the
 * #silence method silences all deprecators in the collection for the
 * duration of a given block.
 */
export class Deprecators {
  private _options: Map<OptionName, unknown>;
  private _deprecators: Map<string, Deprecation>;

  constructor() {
    this._options = new Map();
    this._deprecators = new Map();
  }

  /** Returns a deprecator added to this collection via #[]=. */
  get(name: string): Deprecation | undefined {
    return this._deprecators.get(name);
  }

  /**
   * Adds a given `deprecator` to this collection. The deprecator will be
   * immediately configured with any options previously set on this
   * collection.
   */
  set(name: string, deprecator: Deprecation): void {
    this.applyOptions(deprecator);
    this._deprecators.set(name, deprecator);
  }

  /**
   * Iterates over all deprecators in this collection. Ruby's no-block arm
   * (`return to_enum(__method__) unless block`, `deprecators.rb:41`) has no JS
   * analogue — there is no Enumerator to return — so the block is required.
   */
  each(block: (deprecator: Deprecation) => void): void {
    for (const deprecator of this._deprecators.values()) block(deprecator);
  }

  /** Sets the silenced flag for all deprecators in this collection. */
  setSilenced(silenced: boolean): void {
    this.setOption("silenced", silenced);
  }

  /** Sets the debug flag for all deprecators in this collection. */
  setDebug(debug: boolean): void {
    this.setOption("debug", debug);
  }

  /**
   * Sets the deprecation warning behavior for all deprecators in this
   * collection.
   */
  setBehavior(behavior: DeprecationBehaviorInput): void {
    this.setOption("behavior", behavior);
  }

  /**
   * Sets the disallowed deprecation warning behavior for all deprecators in
   * this collection.
   */
  setDisallowedBehavior(disallowedBehavior: DeprecationBehaviorInput): void {
    this.setOption("disallowedBehavior", disallowedBehavior);
  }

  /** Sets the disallowed deprecation warnings for all deprecators in this collection. */
  setDisallowedWarnings(disallowedWarnings: Deprecation["disallowedWarnings"]): void {
    this.setOption("disallowedWarnings", disallowedWarnings);
  }

  /** Silences all deprecators in this collection for the duration of the given block. */
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
