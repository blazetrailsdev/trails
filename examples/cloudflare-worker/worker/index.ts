import { Base } from "@blazetrails/activerecord";
import "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";
import { setEnv } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import {
  requestToRackEnvWithBody,
  rackResponseToFetchResponse,
} from "../../serverless-lambda/serverless/rack-bridge.ts";

interface Env {
  HYPERDRIVE: { connectionString: string };
}

let booted: Promise<typeof Trails.application> | undefined;
function boot(env: Env) {
  booted ??= (async () => {
    setEnv("DATABASE_URL", env.HYPERDRIVE.connectionString);
    await import("../.trails/entry.generated.js");
    return Trails.application;
  })().catch((e: unknown) => {
    booted = undefined;
    throw e;
  });
  return booted;
}

export default {
  /** Clears every connection after the request: workerd does not let one request use a socket another opened, and Hyperdrive pools the connections to Postgres. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = await boot(env);
    try {
      return rackResponseToFetchResponse(await app.call(await requestToRackEnvWithBody(request)));
    } finally {
      await Base.connectionHandler.clearAllConnectionsBang();
    }
  },
};
