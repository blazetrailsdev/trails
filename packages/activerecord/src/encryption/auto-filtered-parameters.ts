import { underscore } from "@blazetrails/activesupport";
import { Configurable } from "./configurable.js";

/**
 * Automatically adds encrypted attribute names to the application's
 * filter_parameters list, preventing them from appearing in logs.
 *
 * Mirrors: ActiveRecord::Encryption::AutoFilteredParameters
 */
export class AutoFilteredParameters {
  private _filterParameters: string[];
  private _attributesByClass: Map<any, string[]> = new Map();
  private _collecting = true;
  private _hookDisposer?: () => void;

  constructor(filterParameters: string[]) {
    this._filterParameters = filterParameters;
    this.installCollectingHook();
  }

  dispose(): void {
    this._hookDisposer?.();
    this._hookDisposer = undefined;
  }

  enable(): void {
    this.applyCollectedAttributes();
    this._attributesByClass.clear();
    this._collecting = false;
  }

  /** @internal */
  attributeWasDeclared(klass: any, attribute: string): void {
    if (this.isCollecting()) {
      this.collectForLater(klass, attribute);
    } else {
      this.applyFilter(klass, attribute);
    }
  }

  /** @internal */
  private get app(): { config: { filter_parameters: string[] } } {
    return { config: { filter_parameters: this._filterParameters } };
  }

  /** @internal */
  private installCollectingHook(): void {
    this._hookDisposer = Configurable.onEncryptedAttributeDeclared(
      (klass: any, attribute: string) => {
        this.attributeWasDeclared(klass, attribute);
      },
    );
  }

  /** @internal */
  private isCollecting(): boolean {
    return this._collecting;
  }

  /** @internal */
  private isExcludedFromFilterParameters(filterParameter: string): boolean {
    return Configurable.config.excludeFromFilterParameters.some(
      (excluded) => excluded === filterParameter,
    );
  }

  private collectForLater(klass: any, attribute: string): void {
    if (!this._attributesByClass.has(klass)) {
      this._attributesByClass.set(klass, []);
    }
    this._attributesByClass.get(klass)!.push(attribute);
  }

  private applyCollectedAttributes(): void {
    for (const [klass, attributes] of this._attributesByClass) {
      for (const attr of attributes) {
        this.applyFilter(klass, attr);
      }
    }
  }

  private applyFilter(klass: any, attribute: string): void {
    if (!Configurable.config.addToFilterParameters) return;
    const prefix = klass?.name ? underscore(klass.name) : "";
    const filter = prefix ? `${prefix}.${attribute}` : attribute;
    if (
      !this.isExcludedFromFilterParameters(filter) &&
      !this.isExcludedFromFilterParameters(attribute)
    ) {
      if (!this._filterParameters.includes(filter)) {
        this._filterParameters.push(filter);
      }
    }
  }
}
