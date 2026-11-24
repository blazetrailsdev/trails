import { camelize, dasherize, underscore } from "@blazetrails/activesupport";
import {
  block,
  constDefined,
  constGet,
  fetch,
  rbInspect,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { Service } from "../service.js";

type ServiceClass = { build(config: { configurator: Configurator; name: string }): Service };

const loadErrors = new Map<string, unknown>();
const services = ["Disk", "Mirror", "S3", "GCS"];

/** @internal */
export class Configurator {
  readonly configurations: Record<string, Record<string, unknown>>;

  /** @noRailsEquivalent PERMANENT */
  static async load(): Promise<void> {
    for (const className of services) {
      loadErrors.delete(className);
      if (constDefined(Service, `${camelize(className)}Service`)) continue;
      try {
        const path = `./${dasherize(underscore(className))}-service.js`;
        await import(path);
      } catch (error) {
        if ((error as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND") throw error;
        loadErrors.set(className, error);
      }
    }
  }

  static build(
    serviceName: string,
    configurations: Record<string, Record<string, unknown>>,
  ): Service {
    return new this(configurations).build(serviceName);
  }

  constructor(configurations: Record<string, Record<string, unknown>>) {
    this.configurations = configurations;
  }

  build(serviceName: string): Service {
    const config = this.configFor(serviceName);
    return this.resolve(fetch<string>(config, "service")).build({
      ...config,
      configurator: this,
      name: serviceName,
    });
  }

  /** @internal */
  private configFor(name: string): Record<string, unknown> {
    return fetch(
      this.configurations,
      name,
      block(() => {
        throw new RuntimeError(
          `Missing configuration for the :${name} Active Storage service. Configurations available for [${Object.keys(
            this.configurations,
          )
            .map((key) => `:${key}`)
            .join(", ")}]`,
        );
      }),
    );
  }

  /**
   * @internal
   * @inventedArm constDefined — PERMANENT
   */
  private resolve(className: string): ServiceClass {
    if (loadErrors.has(className) || !constDefined(Service, `${camelize(className)}Service`))
      throw new RuntimeError(`Missing service adapter for ${rbInspect(className)}`);
    return constGet(Service, `${camelize(className)}Service`) as ServiceClass;
  }
}

Service.Configurator = Configurator;
