import { toSentence } from "@blazetrails/activesupport";
import { KeyError } from "@blazetrails/ruby-compat";
import type { Service } from "../service.js";
import { Configurator } from "./configurator.js";

/** @internal */
export class Registry {
  /** @internal */
  private configurations: Record<string, Record<string, unknown>>;
  /** @internal */
  private services: Record<string, Service>;
  private _configurator: Configurator | undefined;

  constructor(configurations: Record<string, Record<string, unknown>>) {
    this.configurations = configurations;
    this.services = {};
  }

  fetch<T = never>(name: string, block?: (key: string) => T): Service | T {
    const key = String(name);
    if (Object.hasOwn(this.services, key)) return this.services[key];
    if (Object.hasOwn(this.configurations, key)) {
      return (this.services[key] = this.configurator().build(key));
    } else {
      if (block) {
        return block(key);
      } else {
        throw new KeyError(
          `Missing configuration for the ${key} Active Storage service. ` +
            `Configurations available for the ${toSentence(Object.keys(this.configurations))} services.`,
        );
      }
    }
  }

  /** @internal */
  private configurator(): Configurator {
    return (this._configurator ??= new Configurator(this.configurations));
  }
}
