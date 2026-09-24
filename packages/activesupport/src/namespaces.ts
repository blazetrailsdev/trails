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

interface DalliClient {
  with<T>(block: (c: DalliClient) => T): T;
  get(key: string, options?: Record<string, unknown>): unknown;
  getMulti(keys: string[]): Record<string, unknown>;
  set(key: string, value: unknown, ttl: number, options?: Record<string, unknown>): unknown;
  add(key: string, value: unknown, ttl: number, options?: Record<string, unknown>): unknown;
  delete(key: string): boolean;
  incr(key: string, amt: number, ttl: unknown, def: number): number | null;
  decr(key: string, amt: number, ttl: unknown, def: number): number | null;
  flushAll(): unknown;
  stats(): unknown;
}

interface RedisClient {
  then<T>(block: (c: RedisClient) => T): T;
  get(key: string): unknown;
  set(key: string, value: unknown, modifiers?: Record<string, unknown>): unknown;
  del(...keys: string[]): number;
}

interface Pool<T> {
  with<R>(block: (c: T) => R): R;
  then<R>(block: (c: T) => R): R;
}

type ErrorClass = abstract new (...args: never[]) => Error;

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
  Dalli?: {
    Client: { new: (servers: string[] | null, options: Record<string, unknown>) => DalliClient };
    DalliError: ErrorClass;
    UnmarshalError: ErrorClass;
  };
  Redis?: {
    new: (options: Record<string, unknown>) => RedisClient;
    Distributed: {
      new: (
        nodeConfigs: unknown[],
        options: Record<string, unknown>,
      ) => RedisClient & { addNode(options: Record<string, unknown>): void };
    };
    BaseError: ErrorClass;
  };
  ConnectionPool?: {
    new: <T>(options: Record<string, unknown>, block: () => T) => Pool<T>;
    Error: ErrorClass;
    TimeoutError: ErrorClass;
  };
} = {};
