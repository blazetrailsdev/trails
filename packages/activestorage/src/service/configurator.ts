import { camelize } from "@blazetrails/activesupport";
import { block, fetch, rbInspect, RuntimeError } from "@blazetrails/ruby-compat";
import { Service } from "../service.js";
import { DiskService } from "./disk-service.js";

type ServiceClass = Pick<typeof Service, "build"> &
  (new (config: Record<string, unknown>) => Service);

const services: Record<string, () => ServiceClass> = {
  DiskService: () => DiskService,
};

/** @internal */
export class Configurator {
  readonly configurations: Record<string, Record<string, unknown>>;

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

  /** @internal */
  private resolve(className: string): ServiceClass {
    const klass = services[`${camelize(className)}Service`];
    if (klass === undefined)
      throw new RuntimeError(`Missing service adapter for ${rbInspect(className)}`);
    return klass();
  }
}

Service.Configurator = Configurator;
