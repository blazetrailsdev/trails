import { NotImplementedError } from "../errors.js";
import { underscore } from "@blazetrails/activesupport";
import { Configurable } from "./configurable.js";

/**
 * Automatically adds encrypted attribute names to the application's
 * filter_parameters list, preventing them from appearing in logs.
 *
 * Mirrors: ActiveRecord::Encryption::AutoFilteredParameters
 */
export class AutoFilteredParameters {
  private _attributesByClass: Map<any, string[]> = new Map();
  private _collecting = true;
  private _filterParameters: string[];

  constructor(filterParameters: string[]) {
    this._filterParameters = filterParameters;
  }

  enable(): void {
    this.applyCollectedAttributes();
    this._attributesByClass.clear();
    this._collecting = false;
  }

  /** @internal */
  attributeWasDeclared(klass: any, attribute: string): void {
    if (!Configurable.config.addToFilterParameters) return;
    if (Configurable.config.excludeFromFilterParameters.includes(attribute)) return;
    if (this._collecting) {
      this.collectForLater(klass, attribute);
    } else {
      this.applyFilter(klass, attribute);
    }
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
    const prefix = klass.name ? underscore(klass.name) : "";
    const filter = prefix ? `${prefix}.${attribute}` : attribute;
    if (!this._filterParameters.includes(filter)) {
      this._filterParameters.push(filter);
    }
  }
}

/** @internal */
function app(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::AutoFilteredParameters#app is not implemented",
  );
}

/** @internal */
function installCollectingHook(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::AutoFilteredParameters#install_collecting_hook is not implemented",
  );
}

/** @internal */
function attributeWasDeclared(klass: any, attribute: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::AutoFilteredParameters#attribute_was_declared is not implemented",
  );
}

/** @internal */
function isCollecting(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::AutoFilteredParameters#collecting? is not implemented",
  );
}

/** @internal */
function isExcludedFromFilterParameters(filterParameter: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::AutoFilteredParameters#excluded_from_filter_parameters? is not implemented",
  );
}
