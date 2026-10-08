import { registerConstant, warn } from "@blazetrails/ruby-compat";
import { extend, type Extended } from "@blazetrails/ruby-compat/include";
import * as Autoload from "./dependencies/autoload.js";
import type { BroadcastLogger } from "./broadcast-logger.js";
import type { CacheStore } from "./cache/index.js";
import type { EnvironmentInquirer } from "./environment-inquirer.js";
import type { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import type { Logger } from "./logger.js";
import type { MessagePack } from "./message-pack.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "active_support/message_pack": async () => {
    try {
      return await import("./message-pack.js");
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND") throw error;
      warn(
        "ActiveSupport::MessagePack requires the msgpack gem, version 1.7.0 or later. " +
          'Please add it to your Gemfile: `gem "msgpack", ">= 1.7.0"`',
      );
      throw error;
    }
  },
};

export const ActiveSupport = { name: "ActiveSupport", loadPath } as AutoloadModule & {
  BroadcastLogger: typeof BroadcastLogger;
  HashWithIndifferentAccess: typeof HashWithIndifferentAccess;
  MessagePack?: typeof MessagePack;
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
  I18n?: typeof import("@blazetrails/i18n");
  ActiveSupport?: typeof ActiveSupport;
  ActionView?: { name: string };
  Trails?: {
    env: EnvironmentInquirer;
    logger: Logger | null;
    cache: CacheStore | null;
    application: {
      config: {
        considerAllRequestsLocal: boolean;
        root?: string | null;
        paths(): { get(path: string): { toAry(): string[] } | undefined };
      };
      reloadRoutesUnlessLoaded(): Promise<boolean | null> | undefined;
      executor: { wrap<T>(block: () => T): T };
    } | null;
    Application: abstract new (...args: never[]) => unknown;
    Engine: abstract new (...args: never[]) => unknown;
    Trailtie: abstract new (...args: never[]) => unknown;
    root(): string | null | undefined;
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
  ActionCable?: { Engine?: unknown };
  BCrypt?: {
    Engine: { readonly MIN_COST: number; readonly cost: number };
    Password: {
      create(secret: unknown, options?: { cost?: number | false | null }): object;
      new (rawHash: string): { readonly salt: string; isPassword(secret: unknown): boolean };
    };
  };
  AppBuilder?: new (generator: never) => object;
} = {};

TopLevel.ActiveSupport = ActiveSupport;
registerConstant("ActiveSupport", ActiveSupport);
