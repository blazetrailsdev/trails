import { camelize, constantize } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { CONTENT_TYPE } from "@blazetrails/rack";
import { LoadError, block, fetch, rbModConstSet, rbObjClass } from "@blazetrails/ruby-compat";
import { ActionCable, Server } from "../namespaces.js";

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
    const require = async (path: string): Promise<void> => {
      const load = ActionCable.loadPath[path];
      if (load === undefined) {
        throw Object.assign(new LoadError(`cannot load such file -- ${path}`), { path });
      }
      try {
        await load();
      } catch (e) {
        if ((e as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND") throw e;
        throw Object.assign(new LoadError((e as Error).message, { cause: e }), {
          path: (e as { url?: string }).url ?? null,
        });
      }
    };
    try {
      await require(pathToAdapter);
    } catch (e) {
      if (!(e instanceof LoadError)) throw e;
      const klass = rbObjClass(e) as typeof LoadError;
      if ((e as LoadError & { path?: string | null }).path === pathToAdapter) {
        throw new klass(
          `Could not load the '${adapter}' Action Cable pubsub adapter. Ensure that the adapter is spelled correctly in config/cable.yml and that you've added the necessary adapter gem to your Gemfile.`,
          { cause: e },
        );
      } else {
        throw new klass(
          `Error loading the '${adapter}' Action Cable pubsub adapter. Missing a gem it depends on? ${e.message}`,
          { cause: e },
        );
      }
    }

    adapter = camelize(adapter);
    if (adapter === "Postgresql") adapter = "PostgreSQL";
    return constantize(`ActionCable::SubscriptionAdapter::${adapter}`);
  }
}

rbModConstSet(Server, "Configuration", Configuration);
