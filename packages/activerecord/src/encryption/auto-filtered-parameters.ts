import { underscore } from "@blazetrails/activesupport";
import { Configurable } from "./configurable.js";

interface AutoFilteredParametersApp {
  config: { filterParameters: Array<string | RegExp> };
}

export class AutoFilteredParameters {
  private _app: AutoFilteredParametersApp;
  private _attributesByClass: Map<any, string[]>;
  private _collecting = true;
  private _hookDisposer?: () => void;

  constructor(app: AutoFilteredParametersApp) {
    this._app = app;
    this._attributesByClass = new Map();
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
  private get app(): AutoFilteredParametersApp {
    return this._app;
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
    return (
      Configurable.config.excludedFromFilterParameters.find(
        (excludedFilter) => String(excludedFilter) === filterParameter,
      ) !== undefined
    );
  }

  /** @missingRailsCall new — PERMANENT */
  private collectForLater(klass: any, attribute: string): void {
    if (!this._attributesByClass.has(klass)) {
      this._attributesByClass.set(klass, []);
    }
    this._attributesByClass.get(klass)!.push(attribute);
  }

  private applyCollectedAttributes(): void {
    for (const [klass, attributes] of this._attributesByClass) {
      for (const attribute of attributes) {
        this.applyFilter(klass, attribute);
      }
    }
  }

  private applyFilter(klass: any, attribute: string): void {
    if (!Configurable.config.addToFilterParameters) return;
    const filter = [klass?.name ? underscore(klass.name) : null, String(attribute)]
      .filter((part) => part != null)
      .join(".");
    if (
      !this.isExcludedFromFilterParameters(filter) &&
      !this.isExcludedFromFilterParameters(attribute)
    ) {
      if (!this.app.config.filterParameters.includes(filter)) {
        this.app.config.filterParameters.push(filter);
      }
    }
  }
}
