import { extend, type Extended } from "@blazetrails/ruby-compat/include";
import * as Autoload from "./dependencies/autoload.js";
import type { BroadcastLogger } from "./broadcast-logger.js";
import type { EnvironmentInquirer } from "./environment-inquirer.js";
import type { Logger } from "./logger.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {};

export const ActiveSupport = { name: "ActiveSupport", loadPath } as AutoloadModule & {
  BroadcastLogger: typeof BroadcastLogger;
};
extend(ActiveSupport, Autoload);

interface PolymorphicBuilder {
  handleStringCall(target: unknown, str: string): string;
  handleClassCall(target: unknown, klass: unknown): string;
  handleModelCall(target: unknown, record: unknown): string;
}

interface ParametersInstance {
  hasKey(key: string): boolean;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export const TopLevel: {
  Trails?: {
    env: EnvironmentInquirer;
    logger: Logger | null;
    application: { reloadRoutesUnlessLoaded(): Promise<boolean> | undefined } | null;
  };
  ActionDispatch?: {
    Request: new (env: Record<string, unknown>) => unknown;
    Routing: {
      PolymorphicRoutes: {
        HelperMethodBuilder: { path(): PolymorphicBuilder; url(): PolymorphicBuilder };
      };
    };
  };
  ActionController?: { Parameters: new (...args: never[]) => ParametersInstance };
} = {};
