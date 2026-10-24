import { camelize } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { CONTENT_TYPE } from "@blazetrails/rack";
import {
  LoadError,
  block,
  excBacktrace,
  excSetBacktrace,
  fetch,
  rbModConstSet,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import { ActionCable, Server } from "../namespaces.js";

const BUILT_IN_ADAPTERS: Record<string, () => Promise<Record<string, unknown>>> = {
  "action_cable/subscription_adapter/inline": () => import("../subscription-adapter/inline.js"),
  "action_cable/subscription_adapter/async": () => import("../subscription-adapter/async.js"),
  "action_cable/subscription_adapter/postgresql": () =>
    import("../subscription-adapter/postgresql.js"),
  "action_cable/subscription_adapter/test": () => import("../subscription-adapter/test.js"),
};

type RackResponse = [number, Record<string, string>, unknown[]];

export class Configuration {
  logger: unknown;
  logTags: unknown[];
  connectionClass: () => unknown;
  workerPoolSize: number;
  disableRequestForgeryProtection: boolean;
  allowedRequestOrigins: unknown;
  allowSameOriginAsHost: boolean;
  filterParameters: unknown[];
  cable: Record<string, unknown> | null = null;
  url: unknown;
  mountPath: unknown;
  precompileAssets: unknown;
  healthCheckPath: unknown;
  healthCheckApplication: (env: unknown) => RackResponse;

  constructor() {
    this.logTags = [];

    this.connectionClass = () => (ActionCable.Connection as unknown as { Base: unknown }).Base;
    this.workerPoolSize = 4;

    this.disableRequestForgeryProtection = false;
    this.allowSameOriginAsHost = true;
    this.filterParameters = [];

    this.healthCheckApplication = (_env) => [
      200,
      { [CONTENT_TYPE]: "text/html", date: Time.now().httpdate() },
      [],
    ];
  }

  async pubsubAdapter(): Promise<unknown> {
    let adapter = fetch(
      this.cable!,
      "adapter",
      block(() => "redis"),
    );

    const pathToAdapter = `action_cable/subscription_adapter/${adapter}`;
    const require = async (path: string): Promise<Record<string, unknown>> => {
      const load = ActionCable.SubscriptionAdapter.loadPath[path] ?? BUILT_IN_ADAPTERS[path];
      if (load === undefined) {
        throw Object.assign(new LoadError(`cannot load such file -- ${path}`), { path });
      }
      try {
        return (await load()) as Record<string, unknown>;
      } catch (e) {
        if ((e as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND") throw e;
        throw Object.assign(new LoadError((e as Error).message, { cause: e }), {
          path: (e as { url?: string }).url ?? null,
        });
      }
    };
    let feature: Record<string, unknown>;
    try {
      feature = await require(pathToAdapter);
    } catch (e) {
      if (!(e instanceof LoadError)) throw e;
      const klass = rbObjClass(e) as typeof LoadError;
      if ((e as LoadError & { path?: string | null }).path === pathToAdapter) {
        const error = new klass(
          `Could not load the '${adapter}' Action Cable pubsub adapter. Ensure that the adapter is spelled correctly in config/cable.yml and that you've added the necessary adapter gem to your Gemfile.`,
        );
        excSetBacktrace(error, excBacktrace(e));
        throw error;
      } else {
        const error = new klass(
          `Error loading the '${adapter}' Action Cable pubsub adapter. Missing a gem it depends on? ${e.message}`,
        );
        excSetBacktrace(error, excBacktrace(e));
        throw error;
      }
    }

    adapter = camelize(adapter);
    if (adapter === "Postgresql") adapter = "PostgreSQL";
    return feature[adapter];
  }
}

rbModConstSet(Server, "Configuration", Configuration);
